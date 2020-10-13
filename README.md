# CDK AppSync Project

## Setup

```bash
npm init -y
npm install --save cdk-appsync-project
touch .projenrc.js
```

### Basic .projenrc.js

```javascript
const { AwsCdkAppSyncApp } = require('cdk-appsync-project');
const { NodePackageManager } = require('projen');

const project = new AwsCdkAppSyncApp({
    cdkVersion: '1.63.0',
    transformerVersion: 'v1.63.0-rc.2',
    cdkVersionPinning: true,
    name: 'test',
    packageManager: NodePackageManager.NPM // yarn keeps giving a hoisting issue
});

project.synth();
```

### Run Projen

```bash
npx projen
```