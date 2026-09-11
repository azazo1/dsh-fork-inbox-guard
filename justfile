[private]
default:
    @just --list

# 安装项目依赖.
install:
    pnpm install

# 执行 TypeScript 类型检查, 不生成文件.
typecheck:
    pnpm run typecheck

# 编译 TypeScript 到 lib/.
build:
    pnpm run build

# 构建并运行测试.
test:
    pnpm test

# 类型检查, 构建, 测试与打包预览.
verify:
    just typecheck
    just test
    pnpm pack --dry-run
