class ApplicationContext:
    """Represents a running application under test. Returned by startApplication / attachToApplication."""

    pid: int
    name: str
    isRunning: bool

    def attach(self):
        """Re-attach to the application after a connection loss."""
        ...

    def detach(self):
        """Detach from the application without stopping it."""
        ...

    def kill(self):
        """Forcibly terminate the application process."""
        ...

    def close(self):
        """Request the application to close gracefully."""
        ...

    def waitForIdle(self, timeoutMS: int = -1):
        """Wait until the application's event loop is idle."""
        ...
