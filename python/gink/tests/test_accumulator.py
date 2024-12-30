from contextlib import closing

from .. import *

def test_basics():
    """ Test the basic set/get functionality of directories works as expected. """
    for store in [LmdbStore(), MemoryStore(), ]:
        with closing(store):
            database = Database(store=store)
            for arche in [True, False]:
                accumulator = Accumulator(arche=arche, database=database)
                assert accumulator.get() == 0
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
                assert accumulator.get(before_clear) == Decimal('15.3')

