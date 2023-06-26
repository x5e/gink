    Uses the Lightning Memory Mapped Database (lmdb) to implement the Store interface.

    Under the hood, each gink.mdb file stores several "databases" (tables/b-trees):

        bundles - Used to keep track of all commits we have seen.
            key: bytes(bundle_info), which forces sorting by (timestamp, medallion)
            val: the bytes for the relevant bundle when it was sealed

        chains - Used to keep track of how far along each chain we've seen.
            key: the tuple (medallion, chain_start), packed big endian
            val: bytes(bundle_info) for the last bundle along the given chain

        claims - Used to keep track of which chains this store owns and can append to.
            key: medallion (packed big endian)
            val: chain_start (packed big endian)

        entries - Stores entry payload.
            key: entry-muid
            val: entry binary proto

        placements - Entry proto data from commits, ordered in a way that can be accessed easily.
            key: (container-muid, subject, placement-muid, expiry), with muids packed into 16 bytes
            val: entry-id
            A couple of other wrinkles of note:
                * In the case of a DIRECTORY, the middle-key will be binaryproto of the key.
                * In the case of a SEQUENCE the middle-key will be effective-time
                * In the case of a PROPERTY/ROLE the middle key will be subject muid
                * In the case of a BOX, or NOUN the middle key will be a zero-length byte sequence.
                * In the case of a VERB, the middle key will be the entry id

        removals - Used to soft-delete items from the entries table.
            key: (container-muid, placement-muid you're removing, removing-muid)
            val: binaryproto of the movement, or nothing if removal was a replacement entry

        locations - table used as an index to look-up entries by entry-muid for (re)-moving
            key: (entry-muid, placement-muid)
            val: key from the placements table

        containers - Map from muid to serialized containers definitions.

        retentions - Keeps track of what history is being stored.
            key: one of b"bundles", b"entries"
            val: Big endian encoded int64.
                0 - No history stored.
                1 - All history stored.
                <other microsecond timestamp> - time since when history has been retained

        clearances - tracks clearance changes (most recent per container if not retaining entries)
            key: (container-muid, clearance-muid)
            val: binaryproto of the clearance

        outbox - Keeps track of what has been added locally but not sent to peers.
                 Important to track because if not retaining all bundles locally then need to
                 send locally created bundles to another node to be saved.
            key: bytes(BundleInfo)
            val: bundle bytes (i.e. same as in the bundles table)

        by_describing - an index to enable looking up all the properties on an object/edge
            key: (describing-muid, entry-muid)
            val: container-muid of the container doing the describing

        by_pointee - an index for looking at entries by what they point-to
            key: (pointee-muid, entry-muid)
            val: container-muid

        by_name - a special case index for names (global default property)
            key: (name string, null-byte, entry-muid)
            val: named_muid

        by_side - lookup for edges based on source or target muid
            key: (source/target-muid, placement-muid)
            val: entry-muid
