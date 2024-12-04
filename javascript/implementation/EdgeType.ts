import { isEqual } from "lodash";
import { Database } from "./Database";
import { Container } from "./Container";
import { AsOf, EdgeData, Muid, Value, Bundler, Meta } from "./typedefs";
import { Behavior, ContainerBuilder } from "./builders";
import {
    ensure,
    entryToEdgeData,
    muidToBuilder,
    muidToString,
    muidToTuple,
    muidTupleToMuid,
    muidTupleToString,
    strToMuid,
    wrapValue,
} from "./utils";
import { Edge } from "./Edge";
import { Vertex } from "./Vertex";
import { EntryBuilder } from "./builders";
import { ChangeBuilder } from "./builders";
import { PairBuilder } from "./builders";
import { construct } from "./factories";
import { Property } from "./Property";
import { movementHelper } from "./store_utils";

export class EdgeType extends Container {
    private constructor(
        database: Database,
        address: Muid,
    ) {
        super(database, address, Behavior.EDGE_TYPE);
    }

    static get(database?: Database, muid?: Muid): EdgeType {
        database = database || Database.recent;
        if (! muid) {
            muid = {timestamp: -1, medallion: -1, offset: Behavior.EDGE_TYPE}
        }
        return new EdgeType(database, muid);
    }

    static async create(database?: Database, meta?: Meta): Promise<EdgeType> {
        database = database || Database.recent;
        const muid = await Container.addContainer({behavior: Behavior.EDGE_TYPE, database, meta});
        return new EdgeType(database, muid);
    }

    public size(): Promise<number> {
        throw new Error("not implemented");
    }

    toJson(indent: number | boolean, asOf?: AsOf, seen?: Set<string>): Promise<string> {
        throw new Error("not implemented");
    }

    async create(
        source: Vertex,
        target: Vertex,
        value?: Value,
        meta?: Meta,
    ): Promise<Edge> {
        const muid = await this.addEntry([source, target], value, meta);
        const edgeData: EdgeData = {
            source: source.address,
            target: target.address,
            etype: this.address,
            value,
        };
        return Edge.get(this.database, muid, edgeData);
    }

    async reset(
        toTime?: AsOf,
        recurse?,
        meta?: Meta,
    ): Promise<void> {
        if (recurse === true) {
            recurse = new Set();
        }
        if (recurse instanceof Set) {
            recurse.add(muidToString(this.address));
        }
        const bundler: Bundler = await this.database.startBundle(meta);
        if (!toTime) {
            // If no time is specified, we are resetting to epoch, which is just a clear
            this.clear(false, {bundler});
        } else {
            const entriesThen = await this.database.store.getOrderedEntries(
                this.address,
                Infinity,
                toTime
            );
            const entriesNow = await this.database.store.getOrderedEntries(
                this.address,
                Infinity
            );
            for (const [key, entry] of entriesThen) {
                ensure(
                    isEqual(muidToTuple(this.address), entry.containerId),
                    "entry's containerId doesn't match this edgeType's address"
                );
                const edgeData = entryToEdgeData(entry);
                const effectiveThen = entry.storageKey as number;
                const placementNow = await this.database.store.getLocation(
                    muidTupleToMuid(entry.entryId)
                );
                const effectiveNow = placementNow
                    ? (placementNow.key as number)
                    : undefined;

                if (!effectiveNow) {
                    // This entry existed then, but has since been deleted
                    // Need to re-add it to the previous location
                    const entryBuilder = new EntryBuilder();
                    entryBuilder.setContainer(muidToBuilder(this.address));
                    /*
                        This confused me while writing this, so hopefully it helps
                        whoever is reading this:

                        The effective timestamp is set here, but it will also later
                        be the storageKey when the entry is converted from EntryBuilder
                        to Entry.

                        Setting the key here directly will get overwritten by setPair
                        since they are oneof in the proto definition.
                    */
                    entryBuilder.setEffective(effectiveThen);
                    entryBuilder.setBehavior(entry.behavior);
                    if (entry.value) {
                        entryBuilder.setValue(wrapValue(entry.value));
                    }
                    const pairBuilder = new PairBuilder();
                    pairBuilder.setLeft(muidToBuilder(edgeData.source));
                    pairBuilder.setRite(muidToBuilder(edgeData.target));
                    entryBuilder.setPair(pairBuilder);
                    const changeBuilder = new ChangeBuilder();
                    changeBuilder.setEntry(entryBuilder);
                    const changeMuid = bundler.addChange(changeBuilder);
                    // Copy properties from the edge that previously existed
                    const propertiesThen =
                        await this.database.store.getContainerProperties(
                            muidTupleToMuid(entry.entryId),
                            toTime
                        );
                    // Not using this.createEdge because we already added the
                    // entry to the bundler. this.createEdge does not allow
                    // us to adjust the position of the edge.
                    const newEdge = Edge.get(
                        this.database,
                        changeMuid,
                        edgeData
                    );
                    for (const [key, value] of propertiesThen.entries()) {
                        const property = <Property>(
                            await construct(this.database, strToMuid(key))
                        );
                        ensure(
                            property.behavior === Behavior.PROPERTY,
                            "constructed container isn't a property?"
                        );
                        await property.set(newEdge, value, {bundler});
                    }
                } else {
                    if (effectiveNow && effectiveNow !== effectiveThen) {
                        // This entry exists, but has been moved
                        // Need to move it back
                        await movementHelper(
                            bundler,
                            muidTupleToMuid(entry.entryId),
                            this.address,
                            effectiveThen,
                            false
                        );
                    }
                    // reset the properties of this edge
                    await this.resetEdgeProperties(
                        muidTupleToMuid(entry.entryId),
                        edgeData,
                        toTime,
                        {bundler}
                    );
                    // Need to remove the current entry from entriesNow if
                    // 1) the entry exists but was moved, or 2) the entry is untouched
                    ensure(
                        entriesNow.delete(
                            `${effectiveNow},${muidTupleToString(placementNow.placement)}`
                        ),
                        "entry not found in entriesNow"
                    );
                }
            }
            // We will need to loop through the remaining entries in entriesNow
            // to delete them, since we know they weren't active at toTime
            for (const [key, entry] of entriesNow) {
                await movementHelper(
                    bundler,
                    muidTupleToMuid(entry.entryId),
                    this.address,
                    undefined,
                    false
                );
            }
        }
        if (! meta?.bundler) {
            await bundler.commit();
        }
    }

    /**
     * Specific property reset method to reset the properties of an edge. Resets the properties
     * associated with the edge to toTime.
     *
     * This is separated from the container reset method due to Edges being handled differently from
     * containers (edges are not stored in the internal container database like other containers).
     * @param edgeMuid the muid of the edge to reset
     * @param edgeData the data of the edge to reset
     * @param toTime optional timestamp to reset the properties to
     * @param meta optionally may contain a bundler or comment
     */
    private async resetEdgeProperties(
        edgeMuid: Muid,
        edgeData: EdgeData,
        toTime?: AsOf,
        meta?: Meta,
    ) {
        let immediate = false;
        const bundler: Bundler = await this.database.startBundle(meta);
        const edge = Edge.get(this.database, edgeMuid, edgeData);

        const propertiesNow = await this.database.store.getContainerProperties(
            edge.address
        );
        if (!toTime) {
            // Resetting to epoch, so just delete all properties
            for (const [key, _] of propertiesNow.entries()) {
                const property = <Property>(
                    await construct(this.database, strToMuid(key))
                );
                ensure(
                    property.behavior === Behavior.PROPERTY,
                    "constructed container isn't a property?"
                );
                await property.delete(edge, {bundler});
            }
        } else {
            const propertiesThen =
                await this.database.store.getContainerProperties(edge, toTime);

            for (const [key, value] of propertiesThen.entries()) {
                if (value !== propertiesNow.get(key)) {
                    const property = <Property>(
                        await construct(this.database, strToMuid(key))
                    );
                    ensure(
                        property.behavior === Behavior.PROPERTY,
                        "constructed container isn't a property?"
                    );
                    await property.set(edge, value, {bundler});
                }
                // Remove from propertiesNow so we can delete the rest
                // after this iteration
                propertiesNow.delete(key);
            }
            // Now loop through the remaining entries in propertiesNow and delete them
            for (const [key, _] of propertiesNow.entries()) {
                const property = <Property>(
                    await construct(this.database, strToMuid(key))
                );
                ensure(
                    property.behavior === Behavior.PROPERTY,
                    "constructed container isn't a property?"
                );
                await property.delete(edge, {bundler});
            }
        }
        if (immediate) {
            await bundler.commit();
        }
    }
}
