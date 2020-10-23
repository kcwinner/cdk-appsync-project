# CDK AppSync Project

This project is meant to be used with [projen's external module](https://github.com/eladb/projen#projects-in-external-modules) feature. It will quickly create an AWS AppSync API that uses the [cdk-appsync-transformer](https://github.com/kcwinner/aws-cdk-appsync-transformer).

Currently supports
* [![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/kcwinner/aws-cdk-appsync-transformer/@aws-cdk/core)](https://github.com/aws/aws-cdk)

## How To Use

Since the AppSync transformer uses version `1.63.0` of the AWS CDK we want to pin our version here as there are breaking changes that have not yet been merged into the transformer construct.

```bash
npx projen new --from cdk-appsync-project --cdk-version-pinning true --cdk-version "1.63.0"
```