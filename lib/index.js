"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsCdkAppSyncApp = void 0;
const fs = require("fs-extra");
const path = require("path");
const projen_1 = require("projen");
const pascalCase_1 = require("./pascalCase");
/**
 * (experimental) AWS CDK AppSync Transformer App in TypeScript.
 *
 * @experimental
 * @pjid awscdk-appsync-app-ts
 */
class AwsCdkAppSyncApp extends projen_1.AwsCdkTypeScriptApp {
    /**
     * @experimental
     */
    constructor(options) {
        var _a, _b;
        super({
            ...options,
            sampleCode: false,
        });
        const transformerVersion = options.cdkVersionPinning
            ? `^${options.transformerVersion}`
            : options.transformerVersion;
        this.addDeps(`cdk-appsync-transformer@${transformerVersion}`);
        this.addCdkDependency(...[
            '@aws-cdk/core',
            '@aws-cdk/aws-appsync',
            '@aws-cdk/aws-cognito',
            '@aws-cdk/aws-dynamodb',
            '@aws-cdk/aws-iam',
        ]);
        this.gitignore.exclude('appsync/');
        (_a = this.npmignore) === null || _a === void 0 ? void 0 : _a.exclude('appsync/');
        if ((_b = options.sampleCode) !== null && _b !== void 0 ? _b : true) {
            new SampleCode(this);
        }
    }
}
exports.AwsCdkAppSyncApp = AwsCdkAppSyncApp;
class SampleCode extends projen_1.Component {
    constructor(project) {
        super(project);
        this.appProject = project;
        this.projectName = path.basename(process.cwd());
    }
    synthesize() {
        const srcdir = path.join(this.project.outdir, this.appProject.srcdir);
        if (fs.pathExistsSync(srcdir) && fs.readdirSync(srcdir).filter(x => x.endsWith('.ts'))) {
            return;
        }
        const projectType = pascalCase_1.pascalCase(this.projectName);
        new projen_1.SampleDir(this.project, this.appProject.srcdir, {
            files: {
                'main.ts': this.createMainTsContents(this.projectName, projectType),
            },
        });
        const libDir = path.join(this.appProject.srcdir, 'lib');
        new projen_1.SampleDir(this.appProject, libDir, {
            files: {
                [`${this.projectName}-stack.ts`]: this.createProjectStackContents(projectType),
            },
        });
        const testCode = `import '@aws-cdk/assert/jest';
import { MyStack } from '../src/main'
import { App } from '@aws-cdk/core';

test('Snapshot', () => {
  const app = new App();
  const stack = new MyStack(app, 'test');

  expect(stack).toHaveResource('AWS::Cognito::UserPool');
  expect(stack.api.nestedAppsyncStack).toHaveResource('AWS::AppSync::GraphQLApi');
});`;
        new projen_1.SampleDir(this.project, this.appProject.testdir, {
            files: {
                'main.test.ts': testCode
            }
        });
        const sampleSchema = this.createSampleSchema();
        fs.writeFileSync(path.join(this.project.outdir, 'schema.graphql'), sampleSchema);
    }
    createMainTsContents(projectName, projectType) {
        return `import { App } from '@aws-cdk/core';
import { ${projectType}Stack } from './lib/${projectName}-stack';
const STAGE = process.env.STAGE || 'dev'; // default to dev as the stage
const ACCOUNT = process.env.ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT;
const REGION = process.env.REGION || 'us-east-2'; // default region we are using
const app = new App(
  {
    context: {
      STAGE: STAGE,
    },
  },
);

new ${projectType}Stack(app, \`${projectName}-\${STAGE}\`, {
  terminationProtection: true,
  description: 'Stack for ${projectName}',
  env: {
    account: ACCOUNT,
    region: REGION,
  },
});
app.synth();`;
    }
    createProjectStackContents(projectType) {
        return `import { Construct, Stack, StackProps } from '@aws-cdk/core';
import { AuthorizationType, UserPoolDefaultAction } from '@aws-cdk/aws-appsync';
import { CfnIdentityPool, UserPool, UserPoolClient, VerificationEmailStyle } from '@aws-cdk/aws-cognito';
import { Role, WebIdentityPrincipal } from '@aws-cdk/aws-iam';

import { AppSyncTransformer } from 'cdk-appsync-transformer';

export interface ${projectType}StackProps extends StackProps { }

export class ${projectType}Stack extends Stack {
  public userPool: UserPool;
  public appsyncTransformer: AppSyncTransformer

  constructor(scope: Construct, id: string, props: ${projectType}StackProps = {}) {
    super(scope, id, props);

    this.userPool = new UserPool(this, 'user-pool', {
      autoVerify: {
        email: true,
        phone: false
      },
      selfSignUpEnabled: true,
      signInAliases: {
        email: true
      },
      standardAttributes: {
        email: {
          mutable: true,
          required: true
        },
      },
      userVerification: {
        emailSubject: 'Verify your email',
        emailBody: 'Hello {username}! Your verification code is {####}',
        emailStyle: VerificationEmailStyle.CODE,
      }
    });

    const userpoolWebClient = new UserPoolClient(this, 'user-pool-client', {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: {
        userPassword: true,
      }
    });

    const identityPool = new CfnIdentityPool(this, 'identity-pool', {
      cognitoIdentityProviders: [
        {
          clientId: userpoolWebClient.userPoolClientId,
          providerName: \`cognito-idp.\${this.region}.amazonaws.com/\${this.userPool.userPoolId}\`,
        },
      ],
      allowUnauthenticatedIdentities: true,
    });

    const unauthRole = new Role(this, 'unauth-role', {
      assumedBy: new WebIdentityPrincipal('cognito-identity.amazonaws.com')
        .withConditions({
          'StringEquals': { 'cognito-identity.amazonaws.com:aud': \`\${identityPool.ref}\` },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' },
        }),
    });

    const authRole = new Role(this, 'auth-role', {
      assumedBy: new WebIdentityPrincipal('cognito-identity.amazonaws.com')
        .withConditions({
          'StringEquals': { 'cognito-identity.amazonaws.com:aud': \`\${identityPool.ref}\` },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
        }),
    });

    this.appsyncTransformer = new AppSyncTransformer(this, 'appsync-api', {
      schemaPath: './schema.graphql',
      apiName: 'my-cool-api',
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: this.userPool,
            appIdClientRegex: userpoolWebClient.userPoolClientId,
            defaultAction: UserPoolDefaultAction.ALLOW
          }
        }
      }
    });

    this.appsyncTransformer.grantPublic(unauthRole);
  }
}`;
    }
    createSampleSchema() {
        return `# This is a sample generated schema
type Customer @model
    @auth(rules: [
        { allow: groups, groups: ["Admins"] },
        { allow: private, provider: iam, operations: [read, update] }
    ]) {
        id: ID!
        firstName: String!
        lastName: String!
        active: Boolean!
        address: String!
}

type Product @model
    @auth(rules: [
        { allow: groups, groups: ["Admins"] },
        { allow: public, provider: iam, operations: [read] }
    ]) {
        id: ID!
        name: String!
        description: String!
        price: String!
        active: Boolean!
        added: AWSDateTime!
        orders: [Order] @connection
}

type Order @model
    @key(fields: ["id", "productID"]) {
        id: ID!
        productID: ID!
        total: String!
        ordered: AWSDateTime!
}

# Demonstrate the FUNCTION resolvers
type User @model(queries: null, mutations: null, subscriptions: null)
    @auth(rules: [
        { allow: groups, groups: ["Admins"] },
        { allow: owner, ownerField: "sub" },
        { allow: private, provider: iam, operations: [create, update] }
    ]) {
    id: ID!
    enabled: Boolean!
    status: String!
    email: String!
    name: String!
    email_verified: String
    phone_number: String
    phone_number_verified: String
}

type UserConnection {
    items: [User]
}

input CreateUserInput {
    email: String!
    name: String!
}

input UpdateUserInput {
    id: ID!
    email: String
    name: String
    number: String
}

# Demonstrate the FUNCTION resolvers
type Query {
  listUsers: UserConnection @function(name: "router")
  getUser(id: ID!): User @function(name: "router")
}

type Mutation {
  createUser(input: CreateUserInput!): User @function(name: "router")
  updateUser(input: UpdateUserInput!): User @function(name: "router")
}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQStCO0FBQy9CLDZCQUE2QjtBQUM3QixtQ0FBK0Y7QUFDL0YsNkNBQTBDOzs7Ozs7O0FBZ0IxQyxNQUFhLGdCQUFpQixTQUFRLDRCQUFtQjs7OztJQUN2RCxZQUFZLE9BQWdDOztRQUMxQyxLQUFLLENBQUM7WUFDSixHQUFHLE9BQU87WUFDVixVQUFVLEVBQUUsS0FBSztTQUNsQixDQUFDLENBQUM7UUFFSCxNQUFNLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyxpQkFBaUI7WUFDbEQsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLGtCQUFrQixFQUFFO1lBQ2xDLENBQUMsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUE7UUFFOUIsSUFBSSxDQUFDLE9BQU8sQ0FBQywyQkFBMkIsa0JBQWtCLEVBQUUsQ0FBQyxDQUFBO1FBRTdELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHO1lBQ3ZCLGVBQWU7WUFDZixzQkFBc0I7WUFDdEIsc0JBQXNCO1lBQ3RCLHVCQUF1QjtZQUN2QixrQkFBa0I7U0FDbkIsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbkMsTUFBQSxJQUFJLENBQUMsU0FBUywwQ0FBRSxPQUFPLENBQUMsVUFBVSxFQUFFO1FBRXBDLFVBQUksT0FBTyxDQUFDLFVBQVUsbUNBQUksSUFBSSxFQUFFO1lBQzlCLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3RCO0lBQ0gsQ0FBQztDQUNGO0FBNUJELDRDQTRCQztBQUVELE1BQU0sVUFBVyxTQUFRLGtCQUFTO0lBSWhDLFlBQVksT0FBeUI7UUFDbkMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2YsSUFBSSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUM7UUFDMUIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFTSxVQUFVO1FBQ2YsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3RFLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtZQUN0RixPQUFPO1NBQ1I7UUFFRCxNQUFNLFdBQVcsR0FBRyx1QkFBVSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUVqRCxJQUFJLGtCQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRTtZQUNsRCxLQUFLLEVBQUU7Z0JBQ0wsU0FBUyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQzthQUNwRTtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDeEQsSUFBSSxrQkFBUyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFO1lBQ3JDLEtBQUssRUFBRTtnQkFDTCxDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsV0FBVyxDQUFDLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFdBQVcsQ0FBQzthQUMvRTtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHOzs7Ozs7Ozs7O0lBVWpCLENBQUM7UUFFRCxJQUFJLGtCQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRTtZQUNuRCxLQUFLLEVBQUU7Z0JBQ0wsY0FBYyxFQUFFLFFBQVE7YUFDekI7U0FDRixDQUFDLENBQUE7UUFFRixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUMvQyxFQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBRU8sb0JBQW9CLENBQUMsV0FBbUIsRUFBRSxXQUFtQjtRQUNuRSxPQUFPO1dBQ0EsV0FBVyx1QkFBdUIsV0FBVzs7Ozs7Ozs7Ozs7O01BWWxELFdBQVcsZ0JBQWdCLFdBQVc7OzRCQUVoQixXQUFXOzs7Ozs7YUFNMUIsQ0FBQztJQUNaLENBQUM7SUFFTywwQkFBMEIsQ0FBQyxXQUFtQjtRQUNwRCxPQUFPOzs7Ozs7O21CQU9RLFdBQVc7O2VBRWYsV0FBVzs7OztxREFJMkIsV0FBVzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQTRFOUQsQ0FBQTtJQUNBLENBQUM7SUFFTyxrQkFBa0I7UUFDeEIsT0FBTzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUE2RVQsQ0FBQztJQUNELENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzLWV4dHJhJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBBd3NDZGtUeXBlU2NyaXB0QXBwLCBBd3NDZGtUeXBlU2NyaXB0QXBwT3B0aW9ucywgQ29tcG9uZW50LCBTYW1wbGVEaXIgfSBmcm9tICdwcm9qZW4nO1xuaW1wb3J0IHsgcGFzY2FsQ2FzZSB9IGZyb20gJy4vcGFzY2FsQ2FzZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXdzQ2RrQXBwU3luY0FwcE9wdGlvbnMgZXh0ZW5kcyBBd3NDZGtUeXBlU2NyaXB0QXBwT3B0aW9ucyB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gIHJlYWRvbmx5IHRyYW5zZm9ybWVyVmVyc2lvbjogc3RyaW5nO1xufVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbmV4cG9ydCBjbGFzcyBBd3NDZGtBcHBTeW5jQXBwIGV4dGVuZHMgQXdzQ2RrVHlwZVNjcmlwdEFwcCB7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM6IEF3c0Nka0FwcFN5bmNBcHBPcHRpb25zKSB7XG4gICAgc3VwZXIoe1xuICAgICAgLi4ub3B0aW9ucyxcbiAgICAgIHNhbXBsZUNvZGU6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdHJhbnNmb3JtZXJWZXJzaW9uID0gb3B0aW9ucy5jZGtWZXJzaW9uUGlubmluZ1xuICAgICAgPyBgXiR7b3B0aW9ucy50cmFuc2Zvcm1lclZlcnNpb259YFxuICAgICAgOiBvcHRpb25zLnRyYW5zZm9ybWVyVmVyc2lvblxuXG4gICAgdGhpcy5hZGREZXBzKGBjZGstYXBwc3luYy10cmFuc2Zvcm1lckAke3RyYW5zZm9ybWVyVmVyc2lvbn1gKVxuXG4gICAgdGhpcy5hZGRDZGtEZXBlbmRlbmN5KC4uLltcbiAgICAgICdAYXdzLWNkay9jb3JlJyxcbiAgICAgICdAYXdzLWNkay9hd3MtYXBwc3luYycsXG4gICAgICAnQGF3cy1jZGsvYXdzLWNvZ25pdG8nLFxuICAgICAgJ0Bhd3MtY2RrL2F3cy1keW5hbW9kYicsXG4gICAgICAnQGF3cy1jZGsvYXdzLWlhbScsXG4gICAgXSk7XG5cbiAgICB0aGlzLmdpdGlnbm9yZS5leGNsdWRlKCdhcHBzeW5jLycpO1xuICAgIHRoaXMubnBtaWdub3JlPy5leGNsdWRlKCdhcHBzeW5jLycpO1xuXG4gICAgaWYgKG9wdGlvbnMuc2FtcGxlQ29kZSA/PyB0cnVlKSB7XG4gICAgICBuZXcgU2FtcGxlQ29kZSh0aGlzKTtcbiAgICB9XG4gIH1cbn1cblxuY2xhc3MgU2FtcGxlQ29kZSBleHRlbmRzIENvbXBvbmVudCB7XG4gIHByaXZhdGUgcmVhZG9ubHkgYXBwUHJvamVjdDogQXdzQ2RrQXBwU3luY0FwcDtcbiAgcHJpdmF0ZSByZWFkb25seSBwcm9qZWN0TmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHByb2plY3Q6IEF3c0Nka0FwcFN5bmNBcHApIHtcbiAgICBzdXBlcihwcm9qZWN0KTtcbiAgICB0aGlzLmFwcFByb2plY3QgPSBwcm9qZWN0O1xuICAgIHRoaXMucHJvamVjdE5hbWUgPSBwYXRoLmJhc2VuYW1lKHByb2Nlc3MuY3dkKCkpO1xuICB9XG5cbiAgcHVibGljIHN5bnRoZXNpemUoKSB7XG4gICAgY29uc3Qgc3JjZGlyID0gcGF0aC5qb2luKHRoaXMucHJvamVjdC5vdXRkaXIsIHRoaXMuYXBwUHJvamVjdC5zcmNkaXIpO1xuICAgIGlmIChmcy5wYXRoRXhpc3RzU3luYyhzcmNkaXIpICYmIGZzLnJlYWRkaXJTeW5jKHNyY2RpcikuZmlsdGVyKHggPT4geC5lbmRzV2l0aCgnLnRzJykpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcHJvamVjdFR5cGUgPSBwYXNjYWxDYXNlKHRoaXMucHJvamVjdE5hbWUpO1xuXG4gICAgbmV3IFNhbXBsZURpcih0aGlzLnByb2plY3QsIHRoaXMuYXBwUHJvamVjdC5zcmNkaXIsIHtcbiAgICAgIGZpbGVzOiB7XG4gICAgICAgICdtYWluLnRzJzogdGhpcy5jcmVhdGVNYWluVHNDb250ZW50cyh0aGlzLnByb2plY3ROYW1lLCBwcm9qZWN0VHlwZSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgbGliRGlyID0gcGF0aC5qb2luKHRoaXMuYXBwUHJvamVjdC5zcmNkaXIsICdsaWInKTtcbiAgICBuZXcgU2FtcGxlRGlyKHRoaXMuYXBwUHJvamVjdCwgbGliRGlyLCB7XG4gICAgICBmaWxlczoge1xuICAgICAgICBbYCR7dGhpcy5wcm9qZWN0TmFtZX0tc3RhY2sudHNgXTogdGhpcy5jcmVhdGVQcm9qZWN0U3RhY2tDb250ZW50cyhwcm9qZWN0VHlwZSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgdGVzdENvZGUgPSBgaW1wb3J0ICdAYXdzLWNkay9hc3NlcnQvamVzdCc7XG5pbXBvcnQgeyBNeVN0YWNrIH0gZnJvbSAnLi4vc3JjL21haW4nXG5pbXBvcnQgeyBBcHAgfSBmcm9tICdAYXdzLWNkay9jb3JlJztcblxudGVzdCgnU25hcHNob3QnLCAoKSA9PiB7XG4gIGNvbnN0IGFwcCA9IG5ldyBBcHAoKTtcbiAgY29uc3Qgc3RhY2sgPSBuZXcgTXlTdGFjayhhcHAsICd0ZXN0Jyk7XG5cbiAgZXhwZWN0KHN0YWNrKS50b0hhdmVSZXNvdXJjZSgnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcpO1xuICBleHBlY3Qoc3RhY2suYXBpLm5lc3RlZEFwcHN5bmNTdGFjaykudG9IYXZlUmVzb3VyY2UoJ0FXUzo6QXBwU3luYzo6R3JhcGhRTEFwaScpO1xufSk7YDtcblxuICAgIG5ldyBTYW1wbGVEaXIodGhpcy5wcm9qZWN0LCB0aGlzLmFwcFByb2plY3QudGVzdGRpciwge1xuICAgICAgZmlsZXM6IHtcbiAgICAgICAgJ21haW4udGVzdC50cyc6IHRlc3RDb2RlXG4gICAgICB9XG4gICAgfSlcblxuICAgIGNvbnN0IHNhbXBsZVNjaGVtYSA9IHRoaXMuY3JlYXRlU2FtcGxlU2NoZW1hKCk7XG4gICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odGhpcy5wcm9qZWN0Lm91dGRpciwgJ3NjaGVtYS5ncmFwaHFsJyksIHNhbXBsZVNjaGVtYSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZU1haW5Uc0NvbnRlbnRzKHByb2plY3ROYW1lOiBzdHJpbmcsIHByb2plY3RUeXBlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBgaW1wb3J0IHsgQXBwIH0gZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgeyAke3Byb2plY3RUeXBlfVN0YWNrIH0gZnJvbSAnLi9saWIvJHtwcm9qZWN0TmFtZX0tc3RhY2snO1xuY29uc3QgU1RBR0UgPSBwcm9jZXNzLmVudi5TVEFHRSB8fCAnZGV2JzsgLy8gZGVmYXVsdCB0byBkZXYgYXMgdGhlIHN0YWdlXG5jb25zdCBBQ0NPVU5UID0gcHJvY2Vzcy5lbnYuQUNDT1VOVCB8fCBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UO1xuY29uc3QgUkVHSU9OID0gcHJvY2Vzcy5lbnYuUkVHSU9OIHx8ICd1cy1lYXN0LTInOyAvLyBkZWZhdWx0IHJlZ2lvbiB3ZSBhcmUgdXNpbmdcbmNvbnN0IGFwcCA9IG5ldyBBcHAoXG4gIHtcbiAgICBjb250ZXh0OiB7XG4gICAgICBTVEFHRTogU1RBR0UsXG4gICAgfSxcbiAgfSxcbik7XG5cbm5ldyAke3Byb2plY3RUeXBlfVN0YWNrKGFwcCwgXFxgJHtwcm9qZWN0TmFtZX0tXFwke1NUQUdFfVxcYCwge1xuICB0ZXJtaW5hdGlvblByb3RlY3Rpb246IHRydWUsXG4gIGRlc2NyaXB0aW9uOiAnU3RhY2sgZm9yICR7cHJvamVjdE5hbWV9JyxcbiAgZW52OiB7XG4gICAgYWNjb3VudDogQUNDT1VOVCxcbiAgICByZWdpb246IFJFR0lPTixcbiAgfSxcbn0pO1xuYXBwLnN5bnRoKCk7YDtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlUHJvamVjdFN0YWNrQ29udGVudHMocHJvamVjdFR5cGU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGBpbXBvcnQgeyBDb25zdHJ1Y3QsIFN0YWNrLCBTdGFja1Byb3BzIH0gZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgeyBBdXRob3JpemF0aW9uVHlwZSwgVXNlclBvb2xEZWZhdWx0QWN0aW9uIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWFwcHN5bmMnO1xuaW1wb3J0IHsgQ2ZuSWRlbnRpdHlQb29sLCBVc2VyUG9vbCwgVXNlclBvb2xDbGllbnQsIFZlcmlmaWNhdGlvbkVtYWlsU3R5bGUgfSBmcm9tICdAYXdzLWNkay9hd3MtY29nbml0byc7XG5pbXBvcnQgeyBSb2xlLCBXZWJJZGVudGl0eVByaW5jaXBhbCB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1pYW0nO1xuXG5pbXBvcnQgeyBBcHBTeW5jVHJhbnNmb3JtZXIgfSBmcm9tICdjZGstYXBwc3luYy10cmFuc2Zvcm1lcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgJHtwcm9qZWN0VHlwZX1TdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7IH1cblxuZXhwb3J0IGNsYXNzICR7cHJvamVjdFR5cGV9U3RhY2sgZXh0ZW5kcyBTdGFjayB7XG4gIHB1YmxpYyB1c2VyUG9vbDogVXNlclBvb2w7XG4gIHB1YmxpYyBhcHBzeW5jVHJhbnNmb3JtZXI6IEFwcFN5bmNUcmFuc2Zvcm1lclxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiAke3Byb2plY3RUeXBlfVN0YWNrUHJvcHMgPSB7fSkge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBVc2VyUG9vbCh0aGlzLCAndXNlci1wb29sJywge1xuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgcGhvbmU6IGZhbHNlXG4gICAgICB9LFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlXG4gICAgICB9LFxuICAgICAgc3RhbmRhcmRBdHRyaWJ1dGVzOiB7XG4gICAgICAgIGVtYWlsOiB7XG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHVzZXJWZXJpZmljYXRpb246IHtcbiAgICAgICAgZW1haWxTdWJqZWN0OiAnVmVyaWZ5IHlvdXIgZW1haWwnLFxuICAgICAgICBlbWFpbEJvZHk6ICdIZWxsbyB7dXNlcm5hbWV9ISBZb3VyIHZlcmlmaWNhdGlvbiBjb2RlIGlzIHsjIyMjfScsXG4gICAgICAgIGVtYWlsU3R5bGU6IFZlcmlmaWNhdGlvbkVtYWlsU3R5bGUuQ09ERSxcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJwb29sV2ViQ2xpZW50ID0gbmV3IFVzZXJQb29sQ2xpZW50KHRoaXMsICd1c2VyLXBvb2wtY2xpZW50Jywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3QgaWRlbnRpdHlQb29sID0gbmV3IENmbklkZW50aXR5UG9vbCh0aGlzLCAnaWRlbnRpdHktcG9vbCcsIHtcbiAgICAgIGNvZ25pdG9JZGVudGl0eVByb3ZpZGVyczogW1xuICAgICAgICB7XG4gICAgICAgICAgY2xpZW50SWQ6IHVzZXJwb29sV2ViQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgICAgcHJvdmlkZXJOYW1lOiBcXGBjb2duaXRvLWlkcC5cXCR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vXFwke3RoaXMudXNlclBvb2wudXNlclBvb2xJZH1cXGAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdW5hdXRoUm9sZSA9IG5ldyBSb2xlKHRoaXMsICd1bmF1dGgtcm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IFdlYklkZW50aXR5UHJpbmNpcGFsKCdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb20nKVxuICAgICAgICAud2l0aENvbmRpdGlvbnMoe1xuICAgICAgICAgICdTdHJpbmdFcXVhbHMnOiB7ICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkJzogXFxgXFwke2lkZW50aXR5UG9vbC5yZWZ9XFxgIH0sXG4gICAgICAgICAgJ0ZvckFueVZhbHVlOlN0cmluZ0xpa2UnOiB7ICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yJzogJ3VuYXV0aGVudGljYXRlZCcgfSxcbiAgICAgICAgfSksXG4gICAgfSk7XG5cbiAgICBjb25zdCBhdXRoUm9sZSA9IG5ldyBSb2xlKHRoaXMsICdhdXRoLXJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBXZWJJZGVudGl0eVByaW5jaXBhbCgnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tJylcbiAgICAgICAgLndpdGhDb25kaXRpb25zKHtcbiAgICAgICAgICAnU3RyaW5nRXF1YWxzJzogeyAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZCc6IFxcYFxcJHtpZGVudGl0eVBvb2wucmVmfVxcYCB9LFxuICAgICAgICAgICdGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlJzogeyAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtcic6ICdhdXRoZW50aWNhdGVkJyB9LFxuICAgICAgICB9KSxcbiAgICB9KTtcblxuICAgIHRoaXMuYXBwc3luY1RyYW5zZm9ybWVyID0gbmV3IEFwcFN5bmNUcmFuc2Zvcm1lcih0aGlzLCAnYXBwc3luYy1hcGknLCB7XG4gICAgICBzY2hlbWFQYXRoOiAnLi9zY2hlbWEuZ3JhcGhxbCcsXG4gICAgICBhcGlOYW1lOiAnbXktY29vbC1hcGknLFxuICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICBkZWZhdWx0QXV0aG9yaXphdGlvbjoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBBdXRob3JpemF0aW9uVHlwZS5VU0VSX1BPT0wsXG4gICAgICAgICAgdXNlclBvb2xDb25maWc6IHtcbiAgICAgICAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgICAgICAgYXBwSWRDbGllbnRSZWdleDogdXNlcnBvb2xXZWJDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgICAgIGRlZmF1bHRBY3Rpb246IFVzZXJQb29sRGVmYXVsdEFjdGlvbi5BTExPV1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5hcHBzeW5jVHJhbnNmb3JtZXIuZ3JhbnRQdWJsaWModW5hdXRoUm9sZSk7XG4gIH1cbn1gXG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVNhbXBsZVNjaGVtYSgpOiBzdHJpbmcge1xuICAgIHJldHVybiBgIyBUaGlzIGlzIGEgc2FtcGxlIGdlbmVyYXRlZCBzY2hlbWFcbnR5cGUgQ3VzdG9tZXIgQG1vZGVsXG4gICAgQGF1dGgocnVsZXM6IFtcbiAgICAgICAgeyBhbGxvdzogZ3JvdXBzLCBncm91cHM6IFtcIkFkbWluc1wiXSB9LFxuICAgICAgICB7IGFsbG93OiBwcml2YXRlLCBwcm92aWRlcjogaWFtLCBvcGVyYXRpb25zOiBbcmVhZCwgdXBkYXRlXSB9XG4gICAgXSkge1xuICAgICAgICBpZDogSUQhXG4gICAgICAgIGZpcnN0TmFtZTogU3RyaW5nIVxuICAgICAgICBsYXN0TmFtZTogU3RyaW5nIVxuICAgICAgICBhY3RpdmU6IEJvb2xlYW4hXG4gICAgICAgIGFkZHJlc3M6IFN0cmluZyFcbn1cblxudHlwZSBQcm9kdWN0IEBtb2RlbFxuICAgIEBhdXRoKHJ1bGVzOiBbXG4gICAgICAgIHsgYWxsb3c6IGdyb3VwcywgZ3JvdXBzOiBbXCJBZG1pbnNcIl0gfSxcbiAgICAgICAgeyBhbGxvdzogcHVibGljLCBwcm92aWRlcjogaWFtLCBvcGVyYXRpb25zOiBbcmVhZF0gfVxuICAgIF0pIHtcbiAgICAgICAgaWQ6IElEIVxuICAgICAgICBuYW1lOiBTdHJpbmchXG4gICAgICAgIGRlc2NyaXB0aW9uOiBTdHJpbmchXG4gICAgICAgIHByaWNlOiBTdHJpbmchXG4gICAgICAgIGFjdGl2ZTogQm9vbGVhbiFcbiAgICAgICAgYWRkZWQ6IEFXU0RhdGVUaW1lIVxuICAgICAgICBvcmRlcnM6IFtPcmRlcl0gQGNvbm5lY3Rpb25cbn1cblxudHlwZSBPcmRlciBAbW9kZWxcbiAgICBAa2V5KGZpZWxkczogW1wiaWRcIiwgXCJwcm9kdWN0SURcIl0pIHtcbiAgICAgICAgaWQ6IElEIVxuICAgICAgICBwcm9kdWN0SUQ6IElEIVxuICAgICAgICB0b3RhbDogU3RyaW5nIVxuICAgICAgICBvcmRlcmVkOiBBV1NEYXRlVGltZSFcbn1cblxuIyBEZW1vbnN0cmF0ZSB0aGUgRlVOQ1RJT04gcmVzb2x2ZXJzXG50eXBlIFVzZXIgQG1vZGVsKHF1ZXJpZXM6IG51bGwsIG11dGF0aW9uczogbnVsbCwgc3Vic2NyaXB0aW9uczogbnVsbClcbiAgICBAYXV0aChydWxlczogW1xuICAgICAgICB7IGFsbG93OiBncm91cHMsIGdyb3VwczogW1wiQWRtaW5zXCJdIH0sXG4gICAgICAgIHsgYWxsb3c6IG93bmVyLCBvd25lckZpZWxkOiBcInN1YlwiIH0sXG4gICAgICAgIHsgYWxsb3c6IHByaXZhdGUsIHByb3ZpZGVyOiBpYW0sIG9wZXJhdGlvbnM6IFtjcmVhdGUsIHVwZGF0ZV0gfVxuICAgIF0pIHtcbiAgICBpZDogSUQhXG4gICAgZW5hYmxlZDogQm9vbGVhbiFcbiAgICBzdGF0dXM6IFN0cmluZyFcbiAgICBlbWFpbDogU3RyaW5nIVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBlbWFpbF92ZXJpZmllZDogU3RyaW5nXG4gICAgcGhvbmVfbnVtYmVyOiBTdHJpbmdcbiAgICBwaG9uZV9udW1iZXJfdmVyaWZpZWQ6IFN0cmluZ1xufVxuXG50eXBlIFVzZXJDb25uZWN0aW9uIHtcbiAgICBpdGVtczogW1VzZXJdXG59XG5cbmlucHV0IENyZWF0ZVVzZXJJbnB1dCB7XG4gICAgZW1haWw6IFN0cmluZyFcbiAgICBuYW1lOiBTdHJpbmchXG59XG5cbmlucHV0IFVwZGF0ZVVzZXJJbnB1dCB7XG4gICAgaWQ6IElEIVxuICAgIGVtYWlsOiBTdHJpbmdcbiAgICBuYW1lOiBTdHJpbmdcbiAgICBudW1iZXI6IFN0cmluZ1xufVxuXG4jIERlbW9uc3RyYXRlIHRoZSBGVU5DVElPTiByZXNvbHZlcnNcbnR5cGUgUXVlcnkge1xuICBsaXN0VXNlcnM6IFVzZXJDb25uZWN0aW9uIEBmdW5jdGlvbihuYW1lOiBcInJvdXRlclwiKVxuICBnZXRVc2VyKGlkOiBJRCEpOiBVc2VyIEBmdW5jdGlvbihuYW1lOiBcInJvdXRlclwiKVxufVxuXG50eXBlIE11dGF0aW9uIHtcbiAgY3JlYXRlVXNlcihpbnB1dDogQ3JlYXRlVXNlcklucHV0ISk6IFVzZXIgQGZ1bmN0aW9uKG5hbWU6IFwicm91dGVyXCIpXG4gIHVwZGF0ZVVzZXIoaW5wdXQ6IFVwZGF0ZVVzZXJJbnB1dCEpOiBVc2VyIEBmdW5jdGlvbihuYW1lOiBcInJvdXRlclwiKVxufWA7XG4gIH1cbn0iXX0=