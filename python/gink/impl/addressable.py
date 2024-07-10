from __future__ import annotations
from typing import Optional
from abc import ABC, abstractmethod

from .database import Database
from .muid import Muid
from .bundler import Bundler
from .typedefs import UserValue, GenericTimestamp
from .builders import Behavior, ChangeBuilder
from .coding import encode_value, decode_value
from typing import Dict

class Addressable:
    def __init__(self, database: Database, muid: Muid):
        self._database: Database = database
        self._muid: Muid = muid

    def get_muid(self):
        return self._muid

    def __eq__(self, other):
        return isinstance(other, self.__class__) and other._muid == self._muid

    def __hash__(self):
        return hash(self._muid)

    def get_properties_values_by_name_as_dict(self, as_of: GenericTimestamp = None):
        as_of = self._database.resolve_timestamp(as_of)
        result: Dict[str, UserValue] = dict()
        for found in self._database.get_store().get_by_describing(self._muid, as_of):
            if found.builder.behavior != Behavior.PROPERTY:
                continue
            if found.builder.deletion:
                continue
            if not found.builder.HasField("value"):
                continue # todo: support pointee properties
            property_muid = Muid.create(found.address, found.builder.container)
            property = self._database.get_container(property_muid, behavior=found.builder.behavior)
            name = property.get_name()
            if name is None:
                continue
            result[name] = decode_value(found.builder.value)
        return result

    def get_property_value_by_name(self, name: str, *,
                                   default=None,
                                   as_of: GenericTimestamp=None):
        """ Returns the value of the property with the given name on this container.

            Raises an error if more or less than one property exists for the given name.
        """
        ts = self._database.resolve_timestamp(as_of)
        store = self._database.get_store()
        hits = [fc for fc in store.get_by_name(name, ts) if fc.builder.behavior == Behavior.PROPERTY]
        if len(hits) > 1:
            raise ValueError("More than one property has that name!")
        if len(hits) < 1:
            raise ValueError("No property has that name!")
        found = self._database.get_store().get_entry_by_key(hits[0].address, key=self._muid, as_of=ts)
        if found is None or found.builder.deletion:  # type: ignore
            return default
        assert found.builder.HasField("value"), "property doesn't have a value"
        result = decode_value(found.builder.value)
        return result

    def set_property_value_by_name(self, name: str, value: UserValue, *,
                                   create=True, bundler=None, comment=None):
        immediate = False
        if not isinstance(bundler, Bundler):
            immediate = True
            bundler = Bundler(comment)
        store = self._database.get_store()
        hits = [fc for fc in store.get_by_name(name) if fc.builder.behavior == Behavior.PROPERTY]
        if len(hits) > 1:
            raise ValueError("More than one property has that name!")
        if len(hits) == 0:
            if create:
                creating_change = ChangeBuilder()
                creating_change.container.behavior = Behavior.PROPERTY
                property_muid = bundler.add_change(creating_change)
                naming_change = ChangeBuilder()
                Muid(-1, -1, Behavior.PROPERTY).put_into(naming_change.entry.container)
                property_muid.put_into(naming_change.entry.describing)
                naming_change.entry.behavior = Behavior.PROPERTY
                encode_value(name, naming_change.entry.value)
                bundler.add_change(naming_change)
            else:
                raise ValueError("no property with that name exists and create is not true")
        else:
            property_muid = hits[0].address
        setting_change = ChangeBuilder()
        setting_change.entry.behavior = Behavior.PROPERTY
        property_muid.put_into(setting_change.entry.container)
        self._muid.put_into(setting_change.entry.describing)
        encode_value(value, setting_change.entry.value)
        muid = bundler.add_change(setting_change)
        if immediate:
            self._database.bundle(bundler)
        return muid

    @abstractmethod
    def _get_container(self) -> Muid:
        """ Gets the container associated with this addressable thing, either itself or the Verb. """
