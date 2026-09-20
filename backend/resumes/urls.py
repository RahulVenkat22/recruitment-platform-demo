"""Routes owned by the resumes app: ``resumes/uploads/`` (the candidate-side
``candidates/{id}/resume-link/`` lives in candidates.urls)."""

from django.urls import path

from resumes.views import ResumeUploadView, UploadBatchView

urlpatterns = [
    path("resumes/uploads/", ResumeUploadView.as_view(), name="resume-uploads"),
    path("resumes/uploads/<uuid:batch_id>/", UploadBatchView.as_view(), name="resume-upload-batch"),
]
