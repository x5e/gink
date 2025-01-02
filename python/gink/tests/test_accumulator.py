from contextlib import closing

from .. import *

def test_basics():
    """ Test the basic set/get functionality of accumulators works as expected. """
    for store in [
        LmdbStore(),
        MemoryStore(),
        ]:
        with closing(store):
            database = Database(store=store)
            accumulator = Accumulator(database=database)
            accumulator += 7
            accumulator += 5
            assert accumulator.get() == 12
            accumulator += 3.3
            assert accumulator.get() == Decimal('15.3')
            assert accumulator == 15.3
            before_clear = generate_timestamp()
            accumulator.clear()
            assert accumulator.get() == 0
            accumulator -= 7.7
            assert accumulator.get() == Decimal("-7.7")
            assert accumulator.get(as_of=before_clear) == Decimal('15.3')
            before_reset = generate_timestamp()
            database.reset(before_clear)
            assert accumulator == 15.3
            assert accumulator.get(as_of=before_reset) == Decimal('-7.7')
            database.reset(before_reset)
            assert accumulator == -7.7

