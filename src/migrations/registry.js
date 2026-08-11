// marker 型一次性迁移注册表:up 跑过后记入 system:migrations:applied 台账以跳过重复执行
//
// 契约(重要):
//   - up 必须【幂等可重入】。框架不保证"恰好一次":up 与 markApplied 非原子,
//     若 up 成功但台账写入失败,下次启动会重跑 up——只有 up 幂等才不会重复写入/损坏数据。
//     applied 台账的定位是"跳过已完成迁移"的去重优化(省掉重复扫描),不是恰好一次的强保证。
//   - up 失败必须【抛错】。runMarker 仅在 up 不抛时记台账;若 up 吞错,会被误记"已完成"而永不重试。
//   - 带内部自愈/吞错机制的迁移【不要】放这里,保留各自原生幂等、在 app.js 原位调用:
//       · migrateAlltimeModelStats:内部 marker + 吞错重试(自愈)
//       · migrateGlobalStats:靠 usage:global:total 存在性 + 版本水位自愈(见 runner.runVersionGated)
//
// 新增 = 加一条 { id, legacyMarkerKey?, up }:
//   id            台账唯一标识
//   legacyMarkerKey  存量旧 marker key(首次启动据此接管,避免现网重跑);无存量则省略
//   up            (redis) => Promise,迁移动作本体;必须幂等可重入,失败必须抛错

const registry = []

module.exports = { registry }
