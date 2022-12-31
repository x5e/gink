# Gink Data Model

Gink strives to take a "protocol first" approach, which is to say, that the data stored
and exchanged among gink instances is defined using common protocol buffer specifications,
and how that proto data should be treated is independent of how any single implementation
treats that data.  Not all implementations need necessarily implement every data structure type
or kind of value though, and in fact many of the capabilities described in this document haven't
been fully realized in any implementation yet.

This document describes the sorts of data values and structures 
that can be represented in the Gink Database System, as well as how gink encodes
that data into protobuf.  The typical user of Gink software won't need to read this, as they'll
be using a specific implementation which should have it's own documented interface.  This
document simply describes how implementations should talk to one another.

This document specifically will not cover:
* the Gink authorization and security model
* the synchronization protocol
* details of the lmdb or log-backed file formats
* information about any specific implementation
Separate documents will be created for all of those topics (eventually).

## Changes and Bundles

Each modification to gink happens through one or more change messages.  A bundle wraps zero 
or more change messages into a single transaction/commit, with the understanding that all
of the changes in bundle should be applied or none of them should be.  Each bundle has a
unique (timestamp, medallion) combination, where the medallion is the ID of the database
instance that created the bundle and the timestamp is the integer number of microseconds
since the unix epoch.  Within the bundle, gink implementations place each change inside
of the "changes" map, which results in each change having a unique ID within that bundle.
The (timestamp, medallion) tuple that defines the bundle combine with the change ID within
the bundle to form a globally unique identifier of (timestamp, medallion, offset), which 
gink calls a Muid (see also the Muid document). Each change can be one of:

* A new data structure ("Container") definition.
* A new "Entry" in an existing data structure.
* The "Movement" (repositioning or deletion) of a previously created entry.
* A "Clearance" event that resets a particular data structure back to it's initial empty state.

## Containers and Behaviors

Gink supports several differt kinds of data structures, such as:

* A mapping data type, called a Directory, which is similar to a Python dict or a Javascript object.
* An ordered data type, called a Sequence, similar to a Python list or a Javascript Array.
* A simple data structure that can only contain one value or reference at a time, called a Box.
* ... and others detailed below.

The change that created a particular data structure specifies what kind of data structure it will
be, it's "Behavior", and that behavior cannot ever be changed for that particular container.
In addition to specifying the behavior type of a container, the Container message that creates
a data structure may further limit/define what kind of data it can hold.  For example, you
could specify that a particular sequence can only contain string values, and not numbers or 
references.

### Pre-Defined Global Containers

For each container type (behavior), there implicitly exists a global container of that type 
that does not need to explicitly be defined.  These global containers can be referenced with 
a muid of the form: (timestamp= -1, medallion = -1, offset = BEHAVIOR).  The global containers
can be used in simple applications where multiple container's aren't needed, for boot-strapping
to store references to non-global containers, or for testing / demo purposes.

### Pre-Defined Instance Containers

In addition to the pre-defined containers that any instance can read and write to, there 
implicitly exists a container for each database instance (medallion), that only that instance
(medallion holder) can write to.  Other instances will be able to read the data in the instance
specific containers, and in fact the instance specific containers will be used by the gink
system itself to store information about each specific instance (written at medallion assignment or
creation).  Gink will address the instance specific containers using muids of the form:
(timestamp = -1, medallion = INSTANCE_MEDALLION, offset = BEHAVIOR).

## Entries, Movements, and Clearances

Though the kind of each data structure is fixed at creation time, the contents of each 
container can be modified through subsequent messages (otherwise containers wouldn't be useful).

An "Entry" message typically adds new data to a container, such as by setting a key to a 
particular value or reference in a directory or by adding a new element to a sequence.

Some data structures, such as Sequence, Stream, and Registry, are "ordered" types where
each entry has a position in the data structure, either explicitly via the "position" 
field of the entry, or implicitly via the timestamp of the change.  In these types, 
entries can be moved to a different position with a Movement message, or removed all-together
with a Movement that has no destination.

Other data structures, such as in Directory, KeySet, and Property, no ordering exists, and a new
entry with a matching "link" simply serves to overwrite a previous entry for that link 
(if one exists).  In these cases, entries may only be removed by new entries (either replacing
them with new contents or nothing in case that "deletion" is set to true), or the entries can be
functionally removed with a "Clearance" operation.

For most data structures, with the notable exception of Summations, a Clearance operation 
can be used to wipe out all of the data contained by that data structure.  Additionally, once a
node has received a clearance for a particular container, it will remember the time of the last
clearance, and effectively ignore all data that arrives with timestamps before the clearance time.

### User Values in Entries

Container types such as DIRECTORY, SEQUENCE, PROPERTY, and BOX all have the capability to store
"value" data in entries.  The value data can encode common data types such as:
* character strings
* byte strings
* numbers, including integers, floats, doubles, bigints, fractions, etc.
* dates, datetimes, time, time-zones, etc.
* specialized types such as UUIDs.
* compound types, such a documents and tuples, which can represent "frozen" mapping and 
ordered data structures, respectively.
* Expressions, which can include static values as well as invocations of functions on 
paramaterized values (e.g. Invocation(func="add", ordered arguements=column1, column2)),
which can be used for defining indexes.
In general, "value" data should be used for data that doesn't reference any other part of gink.

### User Keys in Entries

Container types such as DIRECTORY, and KEY_SET allow user to add entries with a specific key,
which will then be used to look up that data in the future.  In order to keep the encoding
into binaryproto deterministic and to work with some limitations of data-stores (e.g. IndexedDB),
only the following data types may be used as keys:

* character strings
* byte strings
* integers (signed, 64 bit)

That's a fairly limited list of data types, and excludes some data types which might
be useful to use as keys but would be a hassle to implement: booleans, floating point numbers,
datetime types, etc.

## History Retention, the Append Only Model, and Purging

The data structures are designed so that any gink instance can be configured to retain 
no history (i.e. get rid of entries once removed or overwritten) partial history (only retaining
data starting at some point in time), or full history (containing every change ever).  When full
or partial history is kept, it will be possible to perform "as-of" queries to look at the state
of the data as if it were some time in the past, simply by skipping over entries of 
more recent timestamps.  Implementations should give users the capability to drop history
and/or start keeping history going forward if it hasn't been maintained.

Even in circumstances when its desirable to maintain most of the history, a user may need to 
permanently remove specific data from all instances.  This can be affected by setting the `purge` 
flag on the relevant removal Movement or Clearance operation.

## Specific Container Types

### Directory

Directories are expected to be the work-horses of Gink and provide the basis (or at least starting 
off point) for how most users interact with a Gink implementation.  All implementations of Gink
should fully support common mapping data type operations such as `set`, `get`, `has`, `clear`, 
as well as iteration over visible items, all in a style that's idiomatic to that language.

In addition to using the `key` and `value` fields of the Entry message, implementations should
allow users to set the `expiry` field of Directory entries, so that directories can be used
in caching applications.  The `expiry` must be stored in microseconds since epoch, but 
application writers should allow users to specify key expiration in terms of TTL seconds as well.

The implicit global directory is expected to be used as a jumping off point for application
writers to place and get to their data, though users are discouraged from placing all of their
data into the global directory, as this will cause headaches when two different applications
using Gink merge their entries (also anyone can "clear" the global directory).

The instance specific directories will be used to store information such as the username,
hostname, and process id of a particular instance, which will be used to when displaying history
(if stored) version-control like fuctionality such as "blame".

TODO: Only like a dozen more container types to document ...
