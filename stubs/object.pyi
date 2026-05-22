class _Object:
    """Squish object introspection module. Available as the global 'object'."""

    def exists(self, objectOrName) -> bool:
        """Return True if the object currently exists in the AUT, False otherwise."""
        ...

    def waitForObjectExists(self, objectOrName, timeoutMS: int = -1):
        """Wait until the object exists and return it."""
        ...

    def isNull(self, objectOrName) -> bool:
        """Return True if the object reference is null or None."""
        ...

    def properties(self, objectOrName) -> dict:
        """Return a dict of all accessible properties and their current values."""
        ...

    def children(self, objectOrName) -> list:
        """Return a list of all direct child objects."""
        ...

    def parent(self, objectOrName):
        """Return the parent object, or None if the object has no parent."""
        ...

    def name(self, objectOrName) -> str:
        """Return the Squish symbolic name string for the object."""
        ...

    def type(self, objectOrName) -> str:
        """Return the type name (class name) of the object as a string."""
        ...

    def className(self, objectOrName) -> str:
        """Return the C++ class name of the object."""
        ...

    def inherits(self, objectOrName, className: str) -> bool:
        """Return True if the object's class inherits from the named class."""
        ...

    def findChild(self, objectOrName, name: str):
        """Find and return a direct child object by its object name."""
        ...

    def findChildren(self, objectOrName, properties: dict) -> list:
        """Return all descendant objects whose properties match the given dict."""
        ...

    def isList(self, objectOrName) -> bool:
        """Return True if the object is a list-like widget."""
        ...

    def item(self, objectOrName, index: int):
        """Return the item at the given index inside a list/table/tree object."""
        ...

    def rowCount(self, objectOrName) -> int:
        """Return the number of rows in a list, table, or tree object."""
        ...

    def columnCount(self, objectOrName) -> int:
        """Return the number of columns in a table object."""
        ...


object: _Object
