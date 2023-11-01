# The Gink Data Model

Gink strives to take a "protocol first" approach, which is to say, that the data stored
and exchanged among gink instances is defined using common protocol-buffer specifications,
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
* the gink authorization and security model
* the synchronization protocol
* details of the lmdb or log-backed file formats
* information about any specific implementation
Separate documents will be created for all of those topics (eventually).

## Changes and Bundles

Each modification to gink happens through one or more change messages.  A bundle wraps zero
or more change messages into a single transaction (commit), with the understanding that all
of the changes in bundle should be applied or none of them should be.  Each bundle has a
unique (timestamp, medallion) combination, where the medallion is the ID of the database
instance that created the bundle, and the timestamp is the integer number of microseconds
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

Gink supports several different kinds of data structures, such as:

* A mapping data type, called a Directory, which is similar to a Python dict or a Javascript Map.
* An ordered data type, called a Sequence, similar to a Python list or a Javascript Array.
* A simple data structure that can only contain one value or reference at a time, called a Box.
* ... and others detailed below.

The change message  that created a particular data structure specifies what kind of data structure
it will be, it's "Behavior", and that behavior cannot ever be changed.

### Pre-Defined Global Containers

For each container type (behavior), there implicitly exists a global container of that type
that does not need to explicitly be defined.  These global containers can be referenced with
a muid of the form: (timestamp= -1, medallion = -1, offset = behavior).  The global containers
can be used in simple applications where multiple container's aren't needed, for boot-strapping
to store references to non-global containers, or for testing / demo purposes.

### Pre-Defined Instance/Medallion Containers

In addition to the pre-defined containers that any instance can read and write to, there
implicitly exists a container for each database instance (medallion), that only that instance
(medallion holder) can write to.  Other instances will be able to read the data in the instance
specific containers. The instance specific containers may be used by the gink
system itself to store information about each specific instance.
Gink will address the instance specific containers using muids of the form:
(timestamp = -1, medallion = INSTANCE_MEDALLION, offset = BEHAVIOR).

## Entries, Movements, and Clearances

Though the behavior available to each data structure is fixed at its creation, the contents of each
container can be modified through subsequent messages (otherwise containers wouldn't be useful).

An "Entry" message typically adds new data to a container, such as by setting a key to a
particular value or reference in a directory or by adding a new element to a sequence.

Some data structures, such as the Sequence, Stream, and Registry types are ordered.
Each entry has a position in the data structure, either explicitly via the "position"
field of the entry, or implicitly via the timestamp of the change.  In these types,
entries can be moved to a different position with a Movement message, or removed all-together
with a Movement that has no destination.

No ordering exists in the Directory, KeySet, or Property data structures.  No Movement messages
can be created to modify their entries.  To remove an entry in one of these structures,
gink simply creates a new entry with a new value (or without any contents if "deletion" is set).

For most data structures, with the notable exception of Summations, a Clearance operation
can be used to wipe out all of the data contained by that data structure.  Once an
instance has received a Clearance for a particular container, any subsequent entries received for
that container with timestamps that predate the clearance should be ignored (though may be saved
in case the user wishes to look at the history).

### User Keys in Entries

Container types such as `DIRECTORY`, and `KEY_SET` allow user to add entries with a specific key,
which will then be used to look up that data in the future.  In order to keep the encoding
into binaryproto deterministic, and to work with some limitations of data-stores (e.g. IndexedDB),
only the following data types may be used as keys:

* integers (signed, 64 bit)
* byte strings
* character strings

That's a fairly limited list of data types, and excludes some data types which might
be useful to use as keys but would be a hassle to implement: booleans, floating point numbers,
datetime types, etc.

### User Values in Entries

Container types such as `DIRECTORY`, `SEQUENCE`, `PROPERTY`, and `BOX` all have the capability
to store "value" data in entries.  The value data can encode common data types such as:
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

### Muid References

Several fields in the Entry proto message are of type Muid, which is to say that they reference
other objects in Gink via the change message that created them.  As a shorthand, the timestamp
field of a reference SHOULD be set to 0 to indicate a change within the same bundle (useful because
the timestamp of a bundle isn't known until it's completed).  The medallion field of a reference
SHOULD also be set to 0 when it's in the same bundle, and MAY be set to 0 when the change being
referenced has the same medallion as the referencing change.

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

## Specific Container Behaviors

Gink supports many different sorts of data stuctures, and arguably should have be called
"Sink" (as in including everything plus the kitchen sink) as the goal is to provide a data type
for most any use case that can be dreamed up.  That being said, it's not expected that all
implementations support all data structures.  The container types most likely to be seen in any
given implementation are described here in decending order.

### DIRECTORY

Directories are expected to be the work-horses of Gink and provide the basis (or at least starting
off point) for how most users interact with a Gink implementation.  All implementations
should fully support common mapping data type operations such as `set`, `get`, `has`, `clear`,
as well as iteration over visible items, all in a style that's idiomatic to that language.

In addition to using the `key` and `value` fields of the Entry message, implementations should
allow users to set the `expiry` field of Directory entries, so that Gink can be used
in caching applications.  The `expiry` must be stored in microseconds since epoch, but
application writers should allow users to specify key expiration in terms of TTL seconds as well,
then translate to the appropriate microsecond timestamp.

The implicit global directory (root) is expected to be used as a jumping off point for application
writers to place and get to their data. Users are discouraged from placing all of their
data into the global directory, as this will cause headaches when two different applications
using Gink merge their entries (also anyone can "clear" the global directory).

The instance specific directories will be used to store information such as the username,
hostname, and process id of a particular instance, which will be used to when displaying history
(if stored) version-control like fuctionality such as "blame" and "log".

### SEQUENCE

* Entries for sequence containers don't have any "link" field but do contain either a value
or reference ("pointee").
* Order is uniquely determined by the pair: (effective-timestamp, positioning change muid).
  * The "effective" timestamp is the timestamp of the bundle by default, but may be explicitly
    overriden in an entry, and may be changed using a movement message.
  * The positioning change is either the entry, or the last movement of that entry.  Since
    the muid of each change is globally unique and well defined, that implies that the ordering
    is well defined.
* A movement without a destination (dest=0) deletes the entry from the corresponding sequence.
* When an entry has an effective timestamp in the future, it should be hidden from normal
  listings of items in that sequence.
  * This behavior is intended to allow sequences to be
  used as work queues: typically a worker will select something to be worked on and move
  it's effective timestamp to some time in the future.  Once the work is done on that entry,
  the worker can delete the entry with another movement.  If the worker fails to complete
  the entry by the time in the future it was set to, then it automatically reappears in the
  sequence and another worker can take a crack at it.
  * This can also be used by to-do like applications to hide an entry until some future time.
  * Setting the effective time of an entry to -1 will serve to hide it indefinately from normal
  listings.  This can be used to implement a "someday" feature (or to suspend an item in a
  work queue indefinately if you're sure that a worker will eventually finish it).
* Gink treats the expiry of a sequence entry separately from the effective timestamp.  Once
  The entry sets its expiry, and this expiry cannot be changed.  After this expiry time,
  the entry should be treated as if it's been deleted.

### BOX

The box data type essentially is a simplifed directory data structure that doesn't allow keys
in entries, and so the box can only store one thing at a time.  That thing can either be a value
or a reference to another database object (a "pointee").  Boxes can be used to add a layer of
indirection, or to store large values you don't want to duplicate (because you can point to boxes
but not to values), or to signify ownership (especially when used with an expiry).

When displaying data from the database in a format such as json, boxes should usually just be
implicitly traversed (e.g. act as if the contents of the box is what was pointed to or stored
whatever data structure was pointing to the box.)

There's currently no prescribed use for the global box or the medallion-specific box instances.

### FILE

Eventually Gink provide file storage capability though this hasn't been realized in any
implementation yet.  When it does the following behavior/limitations should be respected:
* Each entry contains a span indicating what region of the file to write to and optionally octets
  specifying what data to write there.
* If octets are included in an entry, then a span must be included as well, and ends-from should
  equal the number of bytes in the octets field.
* If no octets are included in an entry but the span contains a non-zero "ends" field, then
  implementations should treat the corresponding range in the file between "from" and "ends" as
  zeroed out.
* If a span contains an non-zero "from" field but no "ends" field, then it should act to truncate
  the file to "from" length (and there should be no octets data).
* A clearance on a file should act to truncate the file to length zero.
* Spans written to a file need not be contiguous, i.e. implementations must support sparse files.
* The "octets" field should not hold more than one GiB (2**30 bytes) of data.

### STREAM

In the case where of the `STREAM` behavior, no link is allowed, and the "contains" field
must have octets set with size less than one GiB of data.  Like sequence containers, movements
are allowed, and the ordering algo is the same.

Essentially a stream is just a sequence where entries are forced to be binary data stored
in the "octets" field, rather than containing values or references.  It could be used for
binary logs, and information such as the originating hostname, process id, etc. will be
available through the medallion directory.  It's expected in such cases that you'd want to
set the expiry field so logs aren't retained forever.

### PROPERTY

Typically the way that you'd talk about a property is to say that a particular object has
a property with a particular value.  In Gink, properties are containers themselves and
the objects they describe are the subject.  In other words, in order to set the "height"
property on an object, you first would have to create the "height" property itself, then
you would set in the height property what the value associated with a particular object should be.

The reason for this odd inversion is that it allows constraints to be defined on properties
at property creation time, and separates the property entries from the entries of the data
structures themselves.

The pre-existing global property is by convention used to name/describe objects in the system
(I.e. the value would be a character string), though there are no hard constraints on what
value this property can take and so it can be used in whatever way the user desires.

Currenly properties may contain either values or references to other entities.  It's expected
that the most common use case is to only set properties to be values, but it isn't that hard
to allow the data type type be used for the more general case.

### ROLE

Containers with the `ROLE` behavior have another change as a key ("describing"), but
don't have a value or pointee, and essentially just act as a boolean to differentiate
things within them and those not in the role (though deletions are allowe to remove
something from the role).

In theory, what you could do with properties you could do with role, but since the
role data type only allows for indication of inclusion or exclusion, it's expected that
implementations will optimize to allow quick lookups of all items in a given role set.

Additionally, it's worth noting that role containers work like sets of entities.  In
addition to this set type, we also have the "key set" data type which only allows they key
data types (ints, character strings, and byte strings).  Though in theory they could be combined
into a single data type, in practice implementation will actually be easier to keep key-sets
and value sets as different types (users can always create a data stucture on top of a combination
of one of each if they desire combined behavior).

### KEY_SET

Containers with the `KEY_SET` behavior must have the `key` field set in their entries,
but can't contain any value or reference, though may have deletion set to effectively remove
a item from the set.  The `expiry` field may have a value, though it can be overwritten by
re-adding the particular key to the set without an expiry (before or after expiration).
It cannot use the `effective` field which is only for ordered data types.

### PAIR_MAP

Allows the mapping of a pair of entities to a value or reference.  A typical use case of this
data type would be to keep track of weights between nodes in something like a neural net.
The `deletion` and `expiry` fields may be used with their usual meaning.  As in other mapping
container types, you can't move entries, but you can overwrite them by adding another entry
with the same subject.

### NOUN

Placeholder containers may be created to serve as a proxy for a
real-world object, which then can be described via properties or pointed to via other containers.
Entries for nouns can either soft delete them, effectively removing them from the graph,
or to restore them (undo deletion).

### VERB

A containers with the `VERB` behavior allow links (edges) between database objects to be
created.  Multiple links can exist between two objects, and these links are ordered in time
like sequence entries.  They can be reordered or removed with movement messages.  It's expected
that this data type will be used to implement edges in for graph database type applications
(and that entries/edges will be annotated with properties).  Additionally edges can have a
payload value, to support cases where an edge is used to represent an event (e.g. message).

## Data Types Contemplated But Not Specified

There are a handful of data-types/behaviors that I've considered adding to the Gink Data Model
but haven't (yet).  They're described below.

### View, Materialized View, Derived Table, Etc.

These sorts of data types commonly found in databases likely will be added to Gink in the future.
They don't fit well into the current model as a "container" because they aren't themselves
directly mutable, but typically defined to be a data structure that may be accessed like a
container but actually contain data from elsewhere.  Probably will need a new proto message
beyond the existing container/entry/movement/clearance, though if they're represented by
by something that can be put into a Change message then they'll still be addressible by muid.

### Index, Covering Index, Partial Index, Gin Index

Like a view, these don't fit into the existing data model because they're not directly
mutable themselves, but typically are data structures for accessing data in already existing
structures.  Until formally added to the data model, users can approximate them by explicitly
using a directory to map from keys to keys in other tables or entries in a sequence.

### Homogeneous Array / Vector / Matrix / Tensor Data Type

In many numerical computing applications it's desirable to have single or multi-dimensional
arrays of repeated values of the same data type.  Some sort of container to store this kind
of data could be very useful in machine-learning or scientific applications.  That being said,
there's a lot of nuance that would have to be sorted out, like what kind of compression
(if any) should be used to efficiently encode the data, how it would be accessed / organized
(column-store type behavior?), and how simultaneous updates from disconnected peers ought to
be combined to create a conflict-free result.

### Textual Data

By textual data I'm talking about text documents (prose) or human readable computer code.
This is one data type that I'm *not* likely to add to Gink, at least not anytime soon,
as the use cases are well covered by version control systems like Git and collaborative
document editors like Google Docs, though of course it's possble to just use character
strings and/or the FILE container type if you just need something simple and don't need
complex merging capabilities.

### User Protocol Buffers

In this case, users would include in a container definition something like the contents
of a .proto file, and then entries would contain binary data interpreted via that protobuf
definition.  Such data could be either explicitly keyed, like in a directory, unkeyed (ordered)
like in sequence, or implicitly keyed using an expression or series of expressions on the data.
Though likely to be added in the future, this sort of data encoding can get a bit complicated
and has been deferred until explicit demand arises for it.

### Weighting and/or Summation

A summation would be a container like a box that effectively holds a single value, but it
could only be increased or decreased with entries, and not set directly.

For a weighting would map from pairs of objects to weights.  For all pairs of entities,
they would implicitly start out with a weight of 0 and then be increased or decreased with entries.

Both the weighting and summation behaviors would pose a quandry because it wouldn't be possible
to both allow clearance operations on these objects and also allow nodes to discard entries
and only keep the most recent value.  This is because if a clearance operation could be received
with a timestamp before that of some recent entries.  Without keeping those entries around
it wouldn't be possible to know what the new value should be (because entries with timestamps
after the clearance operation should apply while those with timestamps before it should not).

Though these delta-based data types would be cool, it's more important:
* to allow clear operations on all container types, and
* to allow implementations to offer a no-history-saving mode
both of which ensure that it's possible to keep the storage requirements of Gink managable.

### Tabular Data

It's expected that at some point in the future that Gink will allow for tables and an SQL
interface, either with or without primary keys, but the description for how that data is
to be encoded is left as an exercise for the future.
