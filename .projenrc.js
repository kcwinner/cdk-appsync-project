const { JsiiProject } = require('projen');

const project = new JsiiProject({
    name: 'cdk-appsync-project',
    repository: 'https://github.com/kcwinner/cdk-appsync-project.git',
    stability: 'experimental',
    defaultReleaseBranch: 'main',
    authorName: 'Ken Winner',
    authorAddress: 'kcswinner@gmail.com',

    entrypoint: 'lib/index.js',
    projenDevDependency: true,
    deps: ['projen'],
    peerDeps: ['projen'],
    devDeps: ['@types/fs-extra@^8'], // This will break if it's on 9
    bundledDeps: ['fs-extra'],
    
    eslint: false,
    mergify: false,
});

project.synth();