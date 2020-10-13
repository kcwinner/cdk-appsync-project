import * as fs from 'fs-extra';
import { NodePackageManager } from 'projen';

import { AwsCdkAppSyncApp } from '../src';

describe('project synth', () => {
    const project = new AwsCdkAppSyncApp({
        cdkVersion: '1.63.0',
        transformerVersion: 'v1.63.0-rc.2',
        cdkVersionPinning: true,
        name: 'test-appsync-project',
        packageManager: NodePackageManager.NPM,
    });

    const outdir = fs.mkdtempSync('/tmp/projen-test-');
    project.synth(outdir);

    it('gets deps right', () => {
        const actual = JSON.parse(fs.readFileSync(`${outdir}/package.json`, 'utf-8'));
        expect(actual.dependencies).toEqual({
            '@aws-cdk/assert': '1.63.0',
            '@aws-cdk/core': '1.63.0',
            '@aws-cdk/aws-appsync': '1.63.0',
            '@aws-cdk/aws-cognito': '1.63.0',
            '@aws-cdk/aws-dynamodb': '1.63.0',
            'aws-cdk-appsync-transformer': 'v1.63.0-rc.2',
        });
    });

    it('creates schema.graphql', () => {
        const schemaExists = fs.existsSync(`${outdir}/schema.graphql`);
        expect(schemaExists).toBe(true);
    });

    it('creates index.ts', () => {
        const indexExists = fs.existsSync(`${outdir}/src/main.ts`);
        expect(indexExists).toBe(true);
    });
});