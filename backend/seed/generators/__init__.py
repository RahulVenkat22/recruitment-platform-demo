"""Generators that turn ``seed.pools`` into ORM rows, one module per aggregate.

Each ``seed_*`` function takes the shared ``SeedContext`` (seeded RNG, Faker and
the time anchor) plus whatever earlier generators produced, and returns the rows
it created so the next generator can reference them.
"""
