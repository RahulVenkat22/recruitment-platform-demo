from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """``?page=&page_size=`` pagination: default 20 rows, never more than 100 (plan.md 6.10)."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
