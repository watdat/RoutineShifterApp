# 開発環境のOSとしてNode.js 20 (Linux) を使用します
FROM mcr.microsoft.com/devcontainers/javascript-node:20

# 追加で必要なツール（git, pythonなど）をインストールします
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*
