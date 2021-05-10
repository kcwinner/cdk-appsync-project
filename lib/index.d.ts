import { AwsCdkTypeScriptApp, AwsCdkTypeScriptAppOptions } from 'projen';
/**
 * @experimental
 */
export interface AwsCdkAppSyncAppOptions extends AwsCdkTypeScriptAppOptions {
    /**
     * (experimental) cdk-appsync-transformer version to use.
     *
     * @default "1.77.15"
     * @experimental
     */
    readonly transformerVersion: string;
}
/**
 * (experimental) AWS CDK AppSync Transformer App in TypeScript.
 *
 * @experimental
 * @pjid awscdk-appsync-app-ts
 */
export declare class AwsCdkAppSyncApp extends AwsCdkTypeScriptApp {
    /**
     * @experimental
     */
    constructor(options: AwsCdkAppSyncAppOptions);
}
