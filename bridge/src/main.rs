
use std::fs::File;
use std::path::PathBuf;

mod identity;

fn main() {
    println!("Bridge Phase 2 - Identity Test");
    let test_file = "test_identity.txt";
    std::fs::write(test_file, "Hello Bridge").unwrap();
    let path = std::fs::canonicalize(test_file).unwrap();
    println!("Original path: {:?}", path);

    let id = identity::get_file_identity(&path).expect("Failed to get identity");
    println!("Identity: {:?}", id);

    let new_name = "test_identity_renamed.txt";
    std::fs::rename(test_file, new_name).unwrap();
    println!("Renamed to: {}", new_name);

    let resolved_path = identity::resolve_file_identity(&id).expect("Failed to resolve identity");
    println!("Resolved path: {:?}", resolved_path);

    let moved_name = "../test_identity_moved.txt";
    std::fs::rename(new_name, moved_name).unwrap();
    println!("Moved to: {}", moved_name);

    let resolved_path2 = identity::resolve_file_identity(&id).expect("Failed to resolve identity after move");
    println!("Resolved path after move: {:?}", resolved_path2);

    std::fs::remove_file(moved_name).unwrap();
    println!("File deleted");

    match identity::resolve_file_identity(&id) {
        Ok(p) => println!("ERROR: Should not have resolved, but got {:?}", p),
        Err(e) => println!("Expected error resolving after delete: {:?}", e),
    }
}
