fn main() {
    // Android 15+ devices may use 16 KB memory pages: every LOAD segment of the cdylib must be 16 KB aligned.
    // (The Tauri CLI overwrites CARGO_TARGET_*_RUSTFLAGS, so this cannot live in the workflow env.)
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg-cdylib=-Wl,-z,max-page-size=16384");
        println!("cargo:rustc-link-arg-cdylib=-Wl,-z,common-page-size=16384");
    }
    tauri_build::build()
}
