import argparse
import os
from typing import Any, Dict, List

import yaml

WORKDIR = os.getcwd()
DEFAULT_OUT = os.path.join(WORKDIR, 'clash', 'config.yaml')


def _load_yaml(path: str) -> Dict[str, Any]:
    with open(path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    return data if isinstance(data, dict) else {}


def _collect_proxies(inputs: List[str]) -> List[Dict[str, Any]]:
    """从多个输入文件中合并所有 proxies"""
    all_proxies: List[Dict[str, Any]] = []
    seen_names = set()
    for path in inputs:
        if not os.path.isfile(path):
            print(f'⚠️ 文件不存在，跳过: {path}')
            continue
        data = _load_yaml(path)
        proxies = data.get('proxies', [])
        print(f'   📄 {os.path.basename(path)}: {len(proxies)} 个节点')
        for p in proxies:
            name = p.get('name', '')
            if name not in seen_names:
                seen_names.add(name)
                all_proxies.append(p)
    return all_proxies


def _filter_proxies(proxies: List[Dict[str, Any]], keywords: List[str]) -> List[Dict[str, Any]]:
    """过滤掉名称中含有关键词的节点"""
    if not keywords:
        return proxies
    return [p for p in proxies if not any(kw in str(p.get('name', '')) for kw in keywords)]


def main() -> int:
    parser = argparse.ArgumentParser(description='Clash 订阅配置生成工具')
    parser.add_argument('--input', action='append', default=[], help='输入 YAML 文件路径 (可多次指定)')
    parser.add_argument('--filter', action='append', default=[], help='过滤关键词 (可多次指定)')
    parser.add_argument('--output', default=DEFAULT_OUT, help='输出 config.yaml 路径')
    args = parser.parse_args()

    if not args.input:
        default_input = os.path.join(WORKDIR, 'clash', 'raw_sub.yaml')
        if os.path.isfile(default_input):
            args.input = [default_input]
        else:
            print('❌ 未指定输入文件且默认 clash/raw_sub.yaml 不存在')
            return 1

    # 1. 收集并去重节点
    all_proxies = _collect_proxies(args.input)
    print(f'   📊 合计原始节点: {len(all_proxies)}')

    # 2. 过滤高倍率/无效节点
    filtered = _filter_proxies(all_proxies, args.filter)
    print(f'   🧹 过滤后节点: {len(filtered)}')

    if not filtered:
        print('❌ 过滤后没有剩余节点！请检查过滤条件。')
        return 1

    # 3. 代理组名（读环境变量或默认"自动选择"）
    proxy_group_name = os.environ.get('CLASH_PROXY_GROUP', '自动选择')
    proxy_names = [p['name'] for p in filtered]

    # 4. 构建 Clash 配置
    new_config: Dict[str, Any] = {
        'mixed-port': 7890,
        'allow-lan': True,
        'bind-address': '*',
        'mode': 'rule',
        'log-level': 'info',
        'external-controller': '0.0.0.0:9090',
        'dns': {
            'enable': True,
            'ipv6': False,
            'default-nameserver': ['223.5.5.5', '114.114.114.114'],
            'enhanced-mode': 'fake-ip',
            'fake-ip-range': '198.18.0.1/16',
            'use-hosts': True,
            'nameserver': [
                'https://doh.pub/dns-query',
                'https://dns.alidns.com/dns-query',
            ],
        },
        'proxies': filtered,
        'proxy-groups': [
            {
                'name': proxy_group_name,
                'type': 'url-test',        # 自动测速，选延迟最低节点
                'url': 'http://www.gstatic.com/generate_204',
                'interval': 300,
                'tolerance': 50,
                'proxies': proxy_names,
            },
        ],
        'rules': [
            # 如需将机场域名直连以防止订阅被代理拦截，可取消注释：
            # 'DOMAIN,your-airport-domain.com,DIRECT',
            f'DOMAIN-SUFFIX,google.com,{proxy_group_name}',
            f'DOMAIN-SUFFIX,anthropic.com,{proxy_group_name}',
            f'DOMAIN-SUFFIX,googleapis.com,{proxy_group_name}',
            f'MATCH,{proxy_group_name}',
        ],
    }

    with open(args.output, 'w', encoding='utf-8') as f:
        yaml.dump(new_config, f, allow_unicode=True, default_flow_style=False)

    print(f'✅ 已生成: {args.output}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())