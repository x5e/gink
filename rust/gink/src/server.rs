use crate::proto;
use futures::StreamExt as _;
use log::info;
use std::time;

pub(crate) async fn serve(port: u16) {
    info!("I'm a server on {port}");

    // do proto things
    let _proto_with_one_field_set = proto::ChangeSet {
        timestamp: 1234,
        ..Default::default()
    };

    // launch some async tasks
    info!("Spawning a million tasks...");
    let futures = (0_u64..1_000_000)
        .map(|n| {
            tokio::spawn(async move {
                tokio::time::sleep(time::Duration::from_millis(100)).await;
                n
            })
        })
        .collect::<futures::stream::FuturesUnordered<_>>();

    info!(
        "Calculated sum: {}",
        futures
            .fold(0_u64, |accum, n| async move { accum + n.unwrap() })
            .await
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    // can put brief unit tests here, or move the module to a separate file

    #[test]
    fn silly_test() {
        assert_eq!(2, 2);
    }
}
