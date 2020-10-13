const { JsiiProject, NodePackageManager } = require('projen');

const project = new JsiiProject({
    name: 'cdk-appsync-project',
    repository: 'https://github.com/eladn/cdk-appsync-project.git',
    stability: 'experimental',
    authorName: 'Ken Winner',
    authorAddress: 'kcswinner@gmail.com',
    scripts: {
        'build': 'tsc'
    },
    entrypoint: 'lib/index.js',
    devDeps: ['fs-extra'],
    devDependencies: { '@types/fs-extra': '^8' },
    deps: [ 'fs-extra', 'projen' ],
    peerDeps: ['projen'],
    bundledDeps: [ 'fs-extra' ],
    packageManager: NodePackageManager.NPM,
    eslint: false,
    mergify: false,
    projenDevDependency: true
});

project.synth();