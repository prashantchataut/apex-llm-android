import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "app.apexllm.android"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "app.apexllm.android"
        minSdk = 26
        targetSdk = 34
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
        // Nothing Phone 4a (and every current flagship) is 64-bit ARM only. No x86 / armeabi stubs may ever ship:
        // a single wrong-ABI or placeholder .so is enough for PackageManager to refuse the whole install.
        ndk { abiFilters += listOf("arm64-v8a") }
    }
    packaging {
        // Libraries are stored compressed and extracted at install time: no zip-alignment requirement on the .so itself,
        // so the APK installs regardless of the device page size (4 KB or 16 KB). The ELF is still linked 16 KB-aligned.
        jniLibs { useLegacyPackaging = true }
    }
    signingConfigs {
        // CI generates a keystore and exports these; without them the release APK is left unsigned.
        create("apex") {
            val ks = System.getenv("APEX_KEYSTORE")
            if (ks != null) {
                storeFile = file(ks)
                storePassword = System.getenv("APEX_KS_PASS")
                keyAlias = System.getenv("APEX_KEY_ALIAS")
                keyPassword = System.getenv("APEX_KS_PASS")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (System.getenv("APEX_KEYSTORE") != null) signingConfig = signingConfigs.getByName("apex")
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
