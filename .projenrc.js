const { JsiiProject, NodePackageManager } = require('projen');

const project = new JsiiProject({
    name: 'cdk-appsync-project',
    repository: 'https://github.com/kcwinner/cdk-appsync-project.git',
    stability: 'experimental',
    authorName: 'Ken Winner',
    authorAddress: 'kcswinner@gmail.com',
    scripts: {
        'build': 'tsc'
    },
    entrypoint: 'lib/index.js',
    devDeps: ['fs-extra', '@types/fs-extra'],
    deps: [ 'fs-extra', 'projen' ],
    peerDeps: ['projen'],
    bundledDeps: [ 'fs-extra' ],
    packageManager: NodePackageManager.NPM,
    eslint: false,
    mergify: false,
    projenDevDependency: true
});

project.synth();