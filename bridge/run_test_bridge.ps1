$env:BRIDGE_PORT="3006"
$env:DATABASE_URL="postgres://infinite:infinite@127.0.0.1:5432/infinite_notes_test"
$env:DATA_DIR="./data_test"
$env:IS_TEST_ENV="true"
cargo run --target-dir target-test --manifest-path ./Cargo.toml --bin bridge
