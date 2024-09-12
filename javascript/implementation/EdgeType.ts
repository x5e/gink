import { isEqual } from "lodash";
import { Database } from "./Database";
import { Container } from "./Container";
import { AsOf, EdgeData, Muid, Value } from "./typedefs";
import { Behavior, ContainerBuilder } from "./builders";
import { Bundler } from "./Bundler";
import {
    ensure,
    entryToEdgeData,
    muidToBuilder,
    muidToString,
    muidToTuple,
    muidTupleToMuid,
    muidTupleToString,
    strToMuid,
    wrapKey,
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
    constructor(
        database: Database,
        address: Muid,
        containerBuilder?: ContainerBuilder
    ) {
        super(database, address, Behavior.EDGE_TYPE);
        if (this.address.timestamp < 0) {
            ensure(address.offset === Behavior.EDGE_TYPE);
        } else if (containerBuilder) {
            ensure(containerBuilder.getBehavior() === Behavior.EDGE_TYPE);
        }
    }

    async createEdge(
        source: Vertex,
        target: Vertex,
        value?: Value,
        change?: Bundler | string
    ): Promise<Edge> {
        const muid = await this.addEntry([source, target], value, change);
        const edgeData: EdgeData = {
            source: source.address,
            target: target.address,
            action: this.address,
            value,
        };
        return new Edge(this.database, muid, edgeData);
    }

    async reset(args?: {
        toTime?: AsOf;
        bundlerOrComment?: Bundler | string;
        skipProperties?: boolean;
        recurse?: boolean;
        seen?: Set<string>;
    }): Promise<void> {
        const toTime = args?.toTime;
        const bundlerOrComment = args?.bundlerOrComment;
        const skipProperties = args?.skipProperties;
        const recurse = args?.recurse;
        const seen = recurse ? (args?.seen ?? new Set()) : undefined;
        if (seen) {
            seen.add(muidToString(this.address));
        }
        let immediate = false;
        let bundler: Bundler;
        if (bundlerOrComment instanceof Bundler) {
            bundler = bundlerOrComment;
        } else {
            immediate = true;
            bundler = new Bundler(bundlerOrComment);
        }
        if (!toTime) {
            // If no time is specified, we are resetting to epoch, which is just a clear
            this.clear(false, bundler);
        } else {
            const entriesThen = await this.database.store.getOrderedEntries(
                this.address,
                Infinity,
                toTime
            );
            // Need something subscriptable to compare by position
            const entriesNow = await this.database.store.getOrderedEntries(
                this.address,
                Infinity
            );
            for (const [key, entry] of entriesThen) {
                const placementTupleThen = entry.placementId;
                const placementNow = await this.database.store.getLocation(
                    muidTupleToMuid(entry.entryId)
                );
                const placementTupleNow = placementNow
                    ? placementNow.placement
                    : undefined;

                if (!placementNow) {
                    // This entry existed then, but has since been deleted
                    // Need to re-add it to the previous location
                    const edgeData = entryToEdgeData(entry);
                    const entryBuilder = new EntryBuilder();
                    entryBuilder.setContainer(muidToBuilder(this.address));
                    entryBuilder.setKey(wrapKey(placementTupleThen[0]));
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
                    ensure(
                        isEqual(muidToTuple(this.address), entry.containerId),
                        "entry's containerId doesn't match this edgeType's address"
                    );
                    const newEdge = new Edge(
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

                        await property.set(newEdge, value, bundler);
                    }
                } else {
                    if (
                        placementTupleNow &&
                        placementTupleThen[0] !== placementTupleNow[0]
                    ) {
                        // This entry exists, but has been moved
                        // Need to move it back
                        await movementHelper(
                            bundler,
                            muidTupleToMuid(entry.entryId),
                            this.address,
                            placementTupleThen[0],
                            false
                        );
                        // reset the properties of this edge
                        await this.database.resetContainerProperties(
                            muidTupleToMuid(entry.entryId),
                            toTime,
                            bundler
                        );
                    }
                    // Need to remove the current entry from entriesNow if
                    // 1) the entry exists but was moved, or 2) the entry is untouched
                    ensure(
                        entriesNow.delete(
                            `${placementTupleNow[0]},${muidTupleToString(entry.entryId)}`
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
        if (!skipProperties) {
            // Reset the properties of this edgeType
            await this.database.resetContainerProperties(this, toTime, bundler);
        }
        if (immediate) {
            await this.database.addBundler(bundler);
        }
    }
}
