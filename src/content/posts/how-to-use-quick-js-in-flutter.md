---
title: 如何在 Flutter 中使用 QuickJS
description: 本文系统介绍在 Flutter 中基于 Dart FFI 嵌入轻量级 JavaScript 引擎 QuickJS 的实践方案，涵盖 Windows 与 Android 动态库编译、使用 ffigen 自动生成 C 语言绑定，以及基础代码执行与内存生命周期管理。
date: 2023-11-02
categories:
  - 编程
tags:
  - QuickJS
  - Flutter
  - Dart FFI
---

在跨平台移动与桌面应用开发中，动态执行 JavaScript 脚本是一项常见需求——无论是实现规则引擎、动态业务配置，还是复用既有的 JS 业务逻辑。虽然可以通过嵌入系统 WebView 实现脚本执行，但 WebView 内存占用大、启动开销高，且无法在各端提供高度一致的运行环境。

为此，直接将轻量级 JavaScript 引擎作为原生库嵌入到 Flutter 宿主进程中，成为更为高效的选择。本文将基于 Dart FFI（Foreign Function Interface）技术，详细介绍在 Flutter 应用中集成并使用 QuickJS 引擎的完整实践流程。

## 1. QuickJS 引擎概述

[QuickJS](https://bellard.org/quickjs/) 是由著名计算机科学家 Fabrice Bellard 与 Charlie Gordon 主导开发的小型可嵌入式 JavaScript 引擎。该引擎完整支持 ES2020 规范，并以小巧的体积和优异的启动速度著称。

其核心技术特征包括：

- **小巧且无外部依赖**：引擎完全由 C 语言实现，没有复杂的第三方运行时依赖。在 x86 架构下，编译出的基础代码体积仅约 210 KiB。
- **极短的启动时间与高效解释**：单个运行时实例的创建与初始化耗时低于 300 µs；在单核桌面处理器上，可在约 100 秒内跑完全部 ECMAScript 测试套件（包含 75,000 余项测试）。
- **完整的标准兼容性**：支持 ES2020 核心规范，包括 ES 模块（Modules）、异步生成器（Async Generators）、代理（Proxy）以及大整数（BigInt），并完整支持附录 B（以保证 Web 历史兼容性）。在选择 ES2020 特性时，Test262 官方测试套件通过率接近 100%。
- **确定性的垃圾回收机制**：采用基于引用计数的内存管理模型，大幅减少内存占用并保证回收时机的确定性，同时内置循环引用检测与回收（Cycle Removal）算法，避免内存泄漏。
- **丰富的数学扩展能力**：支持大浮点数（BigFloat）、高精度十进制（BigDecimal）、运算符重载（Operator Overloading）及 BigInt / Math 特性模式。
- **自带标准库与开发工具**：提供封装 C 标准库的基础 API，支持将 JavaScript 源码编译为无依赖的原生可执行二进制文件，并配备了支持语法高亮与上下文着色的 REPL 命令行工具。

## 2. Dart FFI 与跨语言互操作原理

Flutter 应用的核心业务逻辑运行在 Dart 虚拟机之上。与原生 C/C++ 共享库进行底层交互时，需要使用 Dart 官方提供的 `dart:ffi` 库。

**FFI** 即 [Foreign Function Interface](https://en.wikipedia.org/wiki/Foreign_function_interface)（外部函数接口）。`dart:ffi` 允许 Dart 代码直接调用平台动态库中的 C ABI 导出函数，并直接在托管堆之外分配、读写原生堆内存（Native Pointer / Struct）。与通过序列化进行异步进程间/线程间通信的传统 Platform Channel 相比，FFI 是同线程内的直接函数指针调用，具备零编解码开销、极高吞吐量以及能够直接传递复杂结构体指针的优势。

有关 Dart FFI 的规范和用法，可参阅 [Dart C 互操作官方文档](https://dart.dev/guides/libraries/c-interop)。

## 3. 为目标平台编译 QuickJS 动态库

Flutter 是一套跨平台的 UI 框架。要在目标平台上加载 QuickJS，必须预先为对应平台与 CPU 架构编译出适配的动态链接库：
- **Windows**：编译输出 `.dll` 文件；
- **Linux / Android**：编译输出 `.so` 文件；
- **macOS / iOS**：编译输出 `.dylib` 或封装为 XCFramework。

本节重点介绍 Windows 与 Android 两大主流平台的编译方案。

### 3.1 为 Windows 平台编译动态库

Windows 下推荐使用 [MSYS2](https://www.msys2.org/) 环境中的 MinGW-w64 工具链进行编译。

安装 MSYS2 后，在终端中启动对应的 MinGW 环境（64 位系统打开 MINGW64，32 位系统打开 MINGW32），并安装构建依赖：

- **64 位环境（x86_64）**：

```shell
pacman -S mingw-w64-x86_64-gcc mingw-w64-x86_64-make mingw-w64-x86_64-dlfcn
echo "#! /bin/sh" > /mingw64/bin/make
echo "\"mingw32-make\" \"\$@\"" >> /mingw64/bin/make
```

- **32 位环境（i686）**：

```shell
pacman -S mingw-w64-i686-gcc mingw-w64-i686-make mingw-w64-i686-dlfcn
echo "#! /bin/sh" > /mingw32/bin/make
echo "\"mingw32-make\" \"\$@\"" >> /mingw32/bin/make
```

> 注：上述命令中的脚本重定向是为了将 `mingw32-make` 封装为标准的 `make` 指令，以便兼容 Makefile。

接下来克隆 QuickJS 官方仓库并执行编译：

```shell
git clone https://github.com/bellard/quickjs.git
cd quickjs
make
```

执行 `make` 后将生成静态库 `libquickjs.a`。随后使用 GCC 链接生成 Windows 动态链接库：

```shell
gcc -shared -o libquickjs.dll -static -s -Wl,--whole-archive libquickjs.a -lm -Wl,--no-whole-archive
```

**关键链接参数解析**：
- `-shared`：指示输出为动态链接库（DLL）；
- `-static`：静态链接 GCC 运行时库（如 `libwinpthread` 等），避免运行时依赖额外的 MinGW DLL；
- `-s`：剥离可执行符号表与调试信息，以优化二进制体积；
- `-Wl,--whole-archive ... -Wl,--no-whole-archive`：指示链接器完整展开 `libquickjs.a` 中的所有对象文件，确保所有导出的 C 函数符号都被打包至 DLL 中，避免被链接器作为未引用符号优化剔除；
- `-lm`：链接数学库。

### 3.2 为 Android 平台编译动态库

在 Android 平台上，可以通过编写 `CMakeLists.txt` 由 Android NDK 与 Gradle 构建系统统一调度编译。

在 Flutter 项目的 `android/src/main/cpp` 目录下创建 `CMakeLists.txt`。假设我们将 QuickJS 源码作为子模块放置在工程根目录的 `quickjs` 文件夹下，配置示例如下：

```cmake
cmake_minimum_required(VERSION 3.4.1)

project(quickjs LANGUAGES C)

include_directories(quickjs)

set(QUICK_JS_DIR ${CMAKE_CURRENT_LIST_DIR}/../../../../quickjs)

set(
  SOURCE_DIR
  ${QUICK_JS_DIR}/cutils.c
  ${QUICK_JS_DIR}/libbf.c
  ${QUICK_JS_DIR}/libregexp.c
  ${QUICK_JS_DIR}/libunicode.c
  ${QUICK_JS_DIR}/quickjs.c
  ${QUICK_JS_DIR}/quickjs-libc.c
)

file(STRINGS "${QUICK_JS_DIR}/VERSION" CONFIG_VERSION)

add_definitions(-DCONFIG_VERSION="${CONFIG_VERSION}")
add_definitions(-DCONFIG_BIGNUM)
add_definitions(-D_GNU_SOURCE)
add_definitions(-DCONFIG_CC="gcc")
add_definitions(-DCONFIG_PREFIX="/usr/local")

add_library(
  ${PROJECT_NAME}
  SHARED
  ${SOURCE_DIR}
)

target_include_directories(${PROJECT_NAME} PUBLIC .)
```

当 Flutter 构建 Android 应用时，Gradle 会自动调用 NDK 和 CMake 编译对应架构（如 `arm64-v8a`、`armeabi-v7a` 等）的 `libquickjs.so`，并将其自动打包入最终的 APK/AAB 中。关于 Android 原生工程与 CMake 的详细说明，可参考 [Android 官方 NDK 开发文档](https://developer.android.com/studio/projects/add-native-code?hl=zh-cn)。

## 4. 使用 ffigen 生成语言绑定

在 Dart 中通过 FFI 调用 C 接口，必须为每个 C 函数声明对应的类型签名与符号查找（Lookup）。

例如，对于基础的 C 加法函数：

```c
int add(int a, int b) {
  return a + b;
}
```

在 Dart 端必须通过原生函数签名进行显式声明与绑定：

```dart
import 'dart:ffi' as ffi;

final nativeAddFunc = dynamicLibrary.lookup<ffi.NativeFunction<ffi.Int Function(ffi.Int, ffi.Int)>>('add');
final add = nativeAddFunc.asFunction<int Function(int, int)>();
```

这种将底层 C 函数与结构体映射至上层语言类型系统的声明代码，统称为**语言绑定（Language Bindings）**。QuickJS 提供了上百个 API 以及复杂的结构体定义（例如 `JSValue`、`JSRuntime`、`JSContext` 等），如果全部由人工手动编写绑定，不仅工作量巨大，且极易因结构体内存对齐或平台 ABI 差异导致内存崩溃（Segmentation Fault）。

为此，可以使用 Dart 官方提供的 [ffigen](https://pub.dev/packages/ffigen) 工具。`ffigen` 底层基于 LibClang 解析 C 语言头文件的抽象语法树（AST），能够全自动生成严谨、强类型的 Dart FFI 绑定代码。

### 生成绑定的具体步骤

1. 在 Flutter 项目中添加 `ffigen` 开发依赖：

```shell
flutter pub add --dev ffigen
```

2. 在项目根目录的 `pubspec.yaml` 中增加 `ffigen` 构建配置（亦可单独抽离为 `ffigen.yaml`）：

```yaml
ffigen:
  name: QuickJSBindings
  description: Automatically generated Dart bindings for QuickJS
  output: lib/bindings.dart
  headers:
    entry-points:
      - quickjs/quickjs.h
      - quickjs/quickjs-libc.h
```

3. 运行代码生成指令：

```shell
dart run ffigen
```

执行完成后，`lib/bindings.dart` 将生成包含所有 QuickJS 结构体、类型定义与 API 封装的 `QuickJSBindings` 类。

## 5. QuickJS 核心生命周期与代码执行

完成动态库编译与绑定生成后，即可在 Dart 代码中正式调用 QuickJS。

在深入代码之前，需要理解 QuickJS 的两个核心概念：
- **`JSRuntime`**：代表一个独立的 JavaScript 运行时实例，拥有专属的内存分配器与垃圾回收器。不同 `JSRuntime` 之间严格隔离，且不支持跨线程并发访问。
- **`JSContext`**：代表独立的执行上下文，隶属于某一个 `JSRuntime`。每个 Context 拥有独立的全局对象（`globalThis`）。一个 Runtime 下可以创建多个共享内存堆的 Context。

### 5.1 初始化与基础执行流程

完整的代码执行流程包括：加载动态库、创建运行时与上下文、执行脚本、获取返回值以及释放相关原生内存。

```dart
import 'dart:ffi';
import 'package:ffi/ffi.dart';
import 'bindings.dart';

void runQuickJSExample(String libPath, String jsCode, String scriptName) {
  // 1. 加载原生动态库并实例化绑定
  final dylib = DynamicLibrary.open(libPath);
  final qjs = QuickJSBindings(dylib);

  // 2. 创建 JSRuntime 与 JSContext
  final Pointer<JSRuntime> runtime = qjs.JS_NewRuntime();
  final Pointer<JSContext> context = qjs.JS_NewContext(runtime);

  // 3. 将 Dart 字符串转换为 C 原生字符串（以 UTF-8 编码分配在原生堆中）
  final Pointer<Char> input = jsCode.toNativeUtf8().cast<Char>();
  final Pointer<Char> filename = scriptName.toNativeUtf8().cast<Char>();
  final int inputLen = jsCode.length;

  try {
    // 4. 调用 JS_Eval 执行脚本
    // JS_EVAL_TYPE_GLOBAL 代表以全局脚本模式执行
    const int flag = JS_EVAL_TYPE_GLOBAL;
    final JSValue jsValue = qjs.JS_Eval(context, input, inputLen, filename, flag);

    // 5. 检查执行结果是否为异常
    if (qjs.JS_IsException(jsValue) != 0) {
      final JSValue exceptionVal = qjs.JS_GetException(context);
      // 处理/转换异常信息（如调用 JS_ToCString 提取错误堆栈）
      qjs.JS_FreeValue(context, exceptionVal);
      throw Exception('JavaScript execution failed');
    }

    // 6. 将 JSValue 转换映射为 Dart 类型对象（自定义转换逻辑）
    final result = _js2Dart(context, jsValue);

    // 7. 驱动处理微任务及标准事件循环
    _jsStdLoop(context);

    // 8. 必须显式释放返回的 JSValue，避免原生堆内存泄漏
    qjs.JS_FreeValue(context, jsValue);

    print('Execution Result: $result');
  } finally {
    // 9. 释放原生字符串占用的内存
    calloc.free(input);
    calloc.free(filename);

    // 10. 严格按逆序释放上下文与运行时
    qjs.JS_FreeContext(context);
    qjs.JS_FreeRuntime(runtime);
  }
}
```

### 5.2 内存安全与资源释放规范

在 Dart FFI 中使用 QuickJS，必须格外关注内存管理：

1. **手动内存释放**：通过 `toNativeUtf8()` 分配的字符串指针必须使用 `calloc.free()` 或 `malloc.free()` 显式释放。
2. **`JSValue` 引用计数规则**：QuickJS 内部以引用计数管理值生命周期。由 `JS_Eval`、`JS_New*` 或对象属性访问返回的 `JSValue`，其引用计数均已被累加；宿主消费完毕后必须调用 `JS_FreeValue`，否则将导致底层 JavaScript 堆内存泄漏。
3. **逆序销毁原则**：在宿主应用退出或作用域结束时，必须先释放所有从属于该上下文的对象与 `JSContext`，最后才能释放 `JSRuntime`。

## 6. 工程化实践考量

在实际生产工程中将 QuickJS 作为业务引擎使用，还需进一步完善以下机制：

- **事件循环（Event Loop）与 Promise 支持**：QuickJS 原生提供了微任务与作业队列机制。对于异步 Promise 的处理，需结合 `JS_ExecutePendingJob` 或 `js_std_loop`，与 Dart 的异步调度循环（如 `Future.delayed` 或 `Timer.periodic`）进行对齐。
- **并发安全与多线程隔离**：QuickJS 的 `JSRuntime` 并非线程安全，严禁跨线程并发调用同一个 Runtime 或 Context。在 Flutter 中，建议将计算密集的 JS 运行实例封装在独立的 Dart `Isolate` 中执行，利用 `ReceivePort` / `SendPort` 进行跨线程异步通信。
- **宿主与 JS 双向互调**：通过 `JS_NewCFunction` 将 Dart 的 `NativeCallable` 注入为全局 JavaScript 函数，即可实现 JavaScript 对 Flutter/Dart 宿主能力的高性能回调。

## 参考链接

- [flutter_js (GitHub)](https://github.com/abner/flutter_js) — 基于 QuickJS 与 JavaScriptCore 的跨平台 Flutter JS 引擎库
- [flutter_qjs (GitHub)](https://github.com/ekibun/flutter_qjs) — 基于 QuickJS 的轻量级 Flutter JS 绑定封装
- [QuickJS-Windows-Build (GitHub)](https://github.com/mengmo/QuickJS-Windows-Build) — Windows 平台 QuickJS 编译配置参考
- [如何在 Windows 编译和使用 QuickJS (知乎)](https://zhuanlan.zhihu.com/p/623863082) — 深入讲解 MinGW 编译 QuickJS 动态库细节
