""" defines a dummy class """


class Dummy:
    """ a placeholder class """

    def __getattr__(self, _):
        return None
