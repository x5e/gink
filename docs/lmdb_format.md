    Uses the Lightning Memory Mapped Database (lmdb) to implement the Store interface.

    Under the hood, each gink.mdb file stores several "databases" (tables/b-trees):

        bundles - Used to keep track of all bundles we have seen.
            key: received_muts (packed into 8 bytes big endian)
            val: the bytes for the relevant bundle when it was sealed

        bundle_infos - Keeps a map of metadata to actual bundle location.
            key: bytes(bundle_info)
            val: received_muts

        chains - Used to keep track of how far along each chain we've seen.
            key: the tuple (medallion, chain_start), packed big endian
            val: bytes(bundle_info) for the last bundle along the given chain

        identities - Used to keep track of who created the chain.
            key: the tuple (medallion, chain_start), packed big endian
            val: string identity

        claims - Used to keep track of which chains this store owns and can append to.
            key: claim_time (packed big endian)
            val: Claim (encoded protobuf)

        entries - Stores entry payload.
            key: entry-muid
            val: entry binary proto

        placements - Entry proto data from bundles, ordered in a way that can be accessed easily.
            key: (container-muid, subject, placement-muid, expiry), with muids packed into 16 bytes
            val: entry-id
            A couple of other wrinkles of note:
                * In the case of a DIRECTORY, the middle-key will be binaryproto of the key.
                * In the case of a SEQUENCE or EDGE_TYPE the middle-key will be effective-time
                * In the case of a PROPERTY/LABEL/REGISTRY the middle key will be subject muid
                * In the case of a BOX, VERTEX, or ACCUMULATOR there's no middle key.

        removals - Used to soft-delete items from the placements table.
            key: (container-muid, placement-muid you're removing, removing-muid)
            val: binaryproto of the movement, or nothing if removal was a replacement entry

        locations - table used as an index to look-up entries by entry-muid for (re)-moving
            key: (entry-muid, placement-muid)
            val: key from the placements table

        totals - table used to keep the current total (in billionths) for accumulator-like data
            key: (container-muid, key)
            val: string total in the format -?\d+
            Note that for the accumulator datatype itself the key is an empty string.
            I expect future container types will allow a key though.

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

        verify_keys - lookup for the verify key for each chain
            key: the tuple (medallion, chain_start), packed big endian
            val: the verify key

        signing_keys - the private key counterpart to the verify keys, but only for owned chains
            key: the verify key
            val: the signing key
        (Note that to find the signing key for a chain you first need to look up the verify
         key for that chain first then hit this signing_keys table.  This is done because
         you won't know the chain_start time for a chain before it's created, but you
         will want to ensure that you've created and stored the signing key before that step.)

        symmetric_keys - Keys for use in SecretBox encryption.
            key: the shorter hash, stored big endian as a 64 bit integer
            val: The 32 byte symmetric key.
