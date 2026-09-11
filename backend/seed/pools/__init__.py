"""Static data pools for the ``seed_demo`` generators (plan.md section 10).

Every module here is plain Python: dataclasses, tuples and dicts, no Django
imports. The generators in ``seed`` turn these pools into ORM rows; keeping the
pools inert makes them importable from tests, scripts and future providers.

Modules
-------
``users``    the ten demo users and the shared password
``jobs``     the six job descriptions, their participants and version history
``skills``   skill dictionary, per-role weighted skill pools, domains, certifications
``people``   Indian names, cities, companies, titles, education and email domains
``text``     text templates for summaries, resumes, communications, feedback, activities
``journey``  the scripted John Doe journey that reproduces the prompt's sample timeline
"""
