import {
    Muid,
    BundleInfo,
} from "./typedefs";
import {
    ChangeBuilder,
} from "./builders";


export interface Bundler {
    addChange(changeBuilder: ChangeBuilder): Muid;
    commit(comment?: string): Promise<BundleInfo>;
    medallion: number;
}
