fn main() {
    println!("cargo:rerun-if-changed=../../web/build");
    println!("cargo:rerun-if-changed=../../web/index.html");
    println!("cargo:rerun-if-changed=../../web/src");
    println!("cargo:rerun-if-changed=../../web/static");
    tauri_build::build();
}
