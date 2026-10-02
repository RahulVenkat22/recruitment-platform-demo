#!/usr/bin/env python3
"""Deploy a tested immutable image, then publish the SPA. Does not build artifacts.

Requires boto3 and an existing stack created from infra/aws/stack.json with a
CloudFormation service role. No credentials are printed or passed in arguments.
"""

import argparse
import copy
import hashlib
import json
import mimetypes
import re
import time
from pathlib import Path
from urllib.request import Request, urlopen

import boto3
from botocore.exceptions import WaiterError


def outputs(stack):
    return {item["OutputKey"]: item["OutputValue"] for item in stack["Outputs"]}


def migration_definition(current, image, secret_arn):
    allowed = {
        "family",
        "taskRoleArn",
        "executionRoleArn",
        "networkMode",
        "containerDefinitions",
        "volumes",
        "placementConstraints",
        "requiresCompatibilities",
        "cpu",
        "memory",
        "runtimePlatform",
        "ephemeralStorage",
    }
    definition = {k: copy.deepcopy(v) for k, v in current.items() if k in allowed}
    container = definition["containerDefinitions"][0]
    container["image"] = image
    container["command"] = ["python", "manage.py", "release_migrate"]
    container.pop("healthCheck", None)
    container.pop("portMappings", None)
    container["environment"].append(
        {"name": "DATABASE_STATEMENT_TIMEOUT_MS", "value": "600000"}
    )
    for secret in container["secrets"]:
        if secret["name"] == "DATABASE_URL":
            secret["valueFrom"] = secret_arn + ":MIGRATION_DATABASE_URL::"
    return definition


def update_stack(cfn, stack, image, release):
    name = "talentos-release-" + release + "-" + str(int(time.time()))
    updates = {"ApiImage": image, "DesiredCount": "2", "WorkerCount": "2"}
    parameters = [
        {
            "ParameterKey": item["ParameterKey"],
            **(
                {"ParameterValue": updates[item["ParameterKey"]]}
                if item["ParameterKey"] in updates
                else {"UsePreviousValue": True}
            ),
        }
        for item in stack["Parameters"]
    ]
    changes = cfn.create_change_set(
        StackName=stack["StackId"],
        ChangeSetName=name,
        ChangeSetType="UPDATE",
        UsePreviousTemplate=True,
        Parameters=parameters,
        Capabilities=["CAPABILITY_IAM"],
    )
    try:
        cfn.get_waiter("change_set_create_complete").wait(ChangeSetName=changes["Id"])
    except WaiterError:
        status = cfn.describe_change_set(ChangeSetName=changes["Id"])
        if status.get("Status") == "FAILED" and "didn't contain changes" in status.get(
            "StatusReason", ""
        ):
            cfn.delete_change_set(ChangeSetName=changes["Id"])
            return  # Resume an interrupted frontend publication for this image.
        raise
    cfn.execute_change_set(ChangeSetName=changes["Id"])
    cfn.get_waiter("stack_update_complete").wait(
        StackName=stack["StackId"], WaiterConfig={"Delay": 15, "MaxAttempts": 160}
    )


def upload_frontend(s3, directory, bucket, prefix=""):
    files = sorted(path for path in directory.rglob("*") if path.is_file())
    # Entry point last, and retain old assets for clients with an older open tab.
    files.sort(key=lambda path: path.name == "index.html")
    for path in files:
        relative = path.relative_to(directory).as_posix()
        immutable = relative.startswith("assets/")
        s3.upload_file(
            str(path),
            bucket,
            prefix + relative,
            ExtraArgs={
                "ContentType": mimetypes.guess_type(path.name)[0]
                or "application/octet-stream",
                "CacheControl": "public,max-age=31536000,immutable"
                if immutable
                else "no-cache,no-store,must-revalidate",
                "ServerSideEncryption": "AES256",
            },
        )


def smoke(url):
    for path in ["/api/v1/health/", "/api/v1/auth/csrf/"]:
        with urlopen(
            Request(url + path, headers={"Accept": "application/json"}), timeout=15
        ) as response:
            if response.status != 200 or "application/json" not in response.headers.get(
                "Content-Type", ""
            ):
                raise RuntimeError("API smoke check failed: " + path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stack", required=True)
    parser.add_argument("--image", required=True, help="ECR repository@sha256:digest")
    parser.add_argument("--frontend", type=Path, required=True)
    parser.add_argument("--release", required=True, help="git commit SHA")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-f0-9]{40}", args.release):
        parser.error("release must be a full git commit SHA")
    if not (args.frontend / "index.html").is_file():
        parser.error("frontend must contain the tested production build")
    cfn, ecs, s3, cloudfront = [
        boto3.client(name) for name in ("cloudformation", "ecs", "s3", "cloudfront")
    ]
    stack = cfn.describe_stacks(StackName=args.stack)["Stacks"][0]
    out = outputs(stack)
    if not re.fullmatch(
        re.escape(out["RepositoryUri"]) + r"@sha256:[a-f0-9]{64}", args.image
    ):
        parser.error("image must be an immutable digest in this stack's repository")
    if not stack.get("RoleARN"):
        parser.error(
            "the infrastructure stack must have a dedicated CloudFormation service role"
        )
    previous = {
        item["ParameterKey"]: item.get("ParameterValue") for item in stack["Parameters"]
    }
    current = ecs.describe_task_definition(taskDefinition=out["ApiTaskDefinition"])[
        "taskDefinition"
    ]
    definition = migration_definition(current, args.image, out["AppSecretArn"])
    migration = ecs.register_task_definition(**definition)["taskDefinition"][
        "taskDefinitionArn"
    ]
    result = ecs.run_task(
        cluster=out["Cluster"],
        taskDefinition=migration,
        launchType="FARGATE",
        platformVersion="1.4.0",
        count=1,
        networkConfiguration={
            "awsvpcConfiguration": {
                "subnets": out["PrivateSubnets"].split(","),
                "securityGroups": [out["AppSecurityGroup"]],
                "assignPublicIp": "DISABLED",
            }
        },
    )
    if result.get("failures") or len(result.get("tasks", [])) != 1:
        raise RuntimeError("Migration task could not start; inspect ECS events")
    task = result["tasks"][0]["taskArn"]
    ecs.get_waiter("tasks_stopped").wait(
        cluster=out["Cluster"],
        tasks=[task],
        WaiterConfig={"Delay": 10, "MaxAttempts": 180},
    )
    stopped = ecs.describe_tasks(cluster=out["Cluster"], tasks=[task])["tasks"][0]
    if not stopped.get("containers") or any(
        c.get("exitCode") != 0 for c in stopped["containers"]
    ):
        raise RuntimeError("Migration failed; the serving release has not been changed")
    prefix = "releases/" + args.release + "/"
    manifest = {
        "release": args.release,
        "image": args.image,
        "previous_image": previous.get("ApiImage"),
        "index_sha256": hashlib.sha256(
            (args.frontend / "index.html").read_bytes()
        ).hexdigest(),
    }
    upload_frontend(s3, args.frontend, out["ReleasesBucket"], prefix + "frontend/")
    s3.put_object(
        Bucket=out["ReleasesBucket"],
        Key=prefix + "manifest.json",
        Body=json.dumps(manifest).encode(),
        ContentType="application/json",
        ServerSideEncryption="AES256",
    )
    update_stack(cfn, stack, args.image, args.release)
    # Stack success alone can mask a deployment circuit-breaker rollback.
    services = ecs.describe_services(
        cluster=out["Cluster"], services=[out["ApiService"], out["WorkerService"]]
    )["services"]
    if len(services) != 2 or any(s["runningCount"] < 2 for s in services):
        raise RuntimeError("Both services must have at least two running tasks")
    for service in services:
        running = ecs.describe_task_definition(
            taskDefinition=service["taskDefinition"]
        )["taskDefinition"]
        if running["containerDefinitions"][0]["image"] != args.image:
            raise RuntimeError("ECS rolled back; frontend was not changed")
    smoke(out["Url"])
    upload_frontend(s3, args.frontend, out["WebBucket"])
    invalidation = cloudfront.create_invalidation(
        DistributionId=out["DistributionId"],
        InvalidationBatch={
            "CallerReference": args.release + "-" + str(int(time.time())),
            "Paths": {"Quantity": 1, "Items": ["/*"]},
        },
    )["Invalidation"]["Id"]
    cloudfront.get_waiter("invalidation_completed").wait(
        DistributionId=out["DistributionId"], Id=invalidation
    )
    smoke(out["Url"])
    print("Released " + args.release + " to " + out["Url"])
    print(
        "Release manifest: s3://"
        + out["ReleasesBucket"]
        + "/"
        + prefix
        + "manifest.json"
    )


if __name__ == "__main__":
    main()
