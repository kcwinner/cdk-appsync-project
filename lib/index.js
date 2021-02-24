"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsCdkAppSyncApp = void 0;
const fs = require("fs-extra"); // eslint-disable-line
const path = require("path"); // eslint-disable-line
const projen_1 = require("projen"); // eslint-disable-line
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
            ? projen_1.Semver.pinned(options.transformerVersion)
            : projen_1.Semver.caret(options.transformerVersion);
        this.addDeps(`cdk-appsync-transformer@${transformerVersion}`);
        this.addCdkDependency(...[
            '@aws-cdk/core',
            '@aws-cdk/aws-appsync',
            '@aws-cdk/aws-cognito',
            '@aws-cdk/aws-dynamodb',
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
    }
    synthesize() {
        const srcdir = path.join(this.project.outdir, this.appProject.srcdir);
        if (fs.pathExistsSync(srcdir) && fs.readdirSync(srcdir).filter(x => x.endsWith('.ts'))) {
            return;
        }
        const srcCode = `import { App, Construct, Stack, StackProps } from '@aws-cdk/core';
import { UserPool, UserPoolClient, VerificationEmailStyle } from '@aws-cdk/aws-cognito';
import { AuthorizationType, UserPoolDefaultAction } from '@aws-cdk/aws-appsync';

import { AppSyncTransformer } from 'aws-cdk-appsync-transformer';

export class MyStack extends Stack {
  public userPool: UserPool;
  public api: AppSyncTransformer

  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    this.userPool = new UserPool(this, 'cognito', {
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

    const userpoolWebClient = new UserPoolClient(this, 'cognito-user-pool-client', {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        refreshToken: true
      }
    })

    this.api = new AppSyncTransformer(this, 'appsync-api', {
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
    })
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new MyStack(app, 'my-stack-dev', { env: devEnv });
// new MyStack(app, 'my-stack-prod', { env: prodEnv });

app.synth();`;
        fs.mkdirpSync(srcdir);
        fs.writeFileSync(path.join(srcdir, this.appProject.appEntrypoint), srcCode);
        const testdir = path.join(this.project.outdir, this.appProject.testdir);
        if (fs.pathExistsSync(testdir) && fs.readdirSync(testdir).filter(x => x.endsWith('.ts'))) {
            return;
        }
        const testCode = `import '@aws-cdk/assert/jest';
import { MyStack } from '../src/main'
import { App } from '@aws-cdk/core';

test('Snapshot', () => {
  const app = new App();
  const stack = new MyStack(app, 'test');

  expect(stack).toHaveResource('AWS::Cognito::UserPool');
  expect(stack.api.nestedAppsyncStack).toHaveResource('AWS::AppSync::GraphQLApi');
});`;
        fs.mkdirpSync(testdir);
        fs.writeFileSync(path.join(testdir, 'main.test.ts'), testCode);
        const sampleSchema = `# This is a sample generated schema
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
  listUsers: UserConnection @function(name: "currently-unused")
  getUser(id: ID!): User @function(name: "currently-unused")
}

type Mutation {
  createUser(input: CreateUserInput!): User @function(name: "currently-unused")
  updateUser(input: UpdateUserInput!): User @function(name: "currently-unused")
}`;
        fs.writeFileSync(path.join(this.project.outdir, 'schema.graphql'), sampleSchema);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQStCLENBQUMsc0JBQXNCO0FBQ3RELDZCQUE2QixDQUFDLHNCQUFzQjtBQUNwRCxtQ0FBNEYsQ0FBQyxzQkFBc0I7Ozs7Ozs7QUFnQm5ILE1BQWEsZ0JBQWlCLFNBQVEsNEJBQW1COzs7O0lBQ3ZELFlBQVksT0FBZ0M7O1FBQzFDLEtBQUssQ0FBQztZQUNKLEdBQUcsT0FBTztZQUNWLFVBQVUsRUFBRSxLQUFLO1NBQ2xCLENBQUMsQ0FBQztRQUVILE1BQU0sa0JBQWtCLEdBQUcsT0FBTyxDQUFDLGlCQUFpQjtZQUNsRCxDQUFDLENBQUMsZUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUM7WUFDM0MsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFN0MsSUFBSSxDQUFDLE9BQU8sQ0FBQywyQkFBMkIsa0JBQWtCLEVBQUUsQ0FBQyxDQUFBO1FBRTdELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHO1lBQ3ZCLGVBQWU7WUFDZixzQkFBc0I7WUFDdEIsc0JBQXNCO1lBQ3RCLHVCQUF1QjtTQUN4QixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNuQyxNQUFBLElBQUksQ0FBQyxTQUFTLDBDQUFFLE9BQU8sQ0FBQyxVQUFVLEVBQUU7UUFFcEMsVUFBSSxPQUFPLENBQUMsVUFBVSxtQ0FBSSxJQUFJLEVBQUU7WUFDOUIsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDdEI7SUFDSCxDQUFDO0NBQ0Y7QUEzQkQsNENBMkJDO0FBRUQsTUFBTSxVQUFXLFNBQVEsa0JBQVM7SUFHaEMsWUFBWSxPQUF5QjtRQUNuQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDZixJQUFJLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQztJQUM1QixDQUFDO0lBRU0sVUFBVTtRQUNmLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0RSxJQUFJLEVBQUUsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUU7WUFDdEYsT0FBTztTQUNSO1FBRUQsTUFBTSxPQUFPLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzthQXdFUCxDQUFDO1FBRVYsRUFBRSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0QixFQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFNUUsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3hFLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtZQUN4RixPQUFPO1NBQ1I7UUFFRCxNQUFNLFFBQVEsR0FBRzs7Ozs7Ozs7OztJQVVqQixDQUFDO1FBRUQsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2QixFQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGNBQWMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRS9ELE1BQU0sWUFBWSxHQUFHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQTZFdkIsQ0FBQztRQUVDLEVBQUUsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ25GLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzLWV4dHJhJzsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJzsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuaW1wb3J0IHsgQXdzQ2RrVHlwZVNjcmlwdEFwcCwgQXdzQ2RrVHlwZVNjcmlwdEFwcE9wdGlvbnMsIENvbXBvbmVudCwgU2VtdmVyIH0gZnJvbSAncHJvamVuJzsgLy8gZXNsaW50LWRpc2FibGUtbGluZVxuXG5leHBvcnQgaW50ZXJmYWNlIEF3c0Nka0FwcFN5bmNBcHBPcHRpb25zIGV4dGVuZHMgQXdzQ2RrVHlwZVNjcmlwdEFwcE9wdGlvbnMge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gIHJlYWRvbmx5IHRyYW5zZm9ybWVyVmVyc2lvbjogc3RyaW5nO1xufVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbmV4cG9ydCBjbGFzcyBBd3NDZGtBcHBTeW5jQXBwIGV4dGVuZHMgQXdzQ2RrVHlwZVNjcmlwdEFwcCB7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM6IEF3c0Nka0FwcFN5bmNBcHBPcHRpb25zKSB7XG4gICAgc3VwZXIoe1xuICAgICAgLi4ub3B0aW9ucyxcbiAgICAgIHNhbXBsZUNvZGU6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdHJhbnNmb3JtZXJWZXJzaW9uID0gb3B0aW9ucy5jZGtWZXJzaW9uUGlubmluZ1xuICAgICAgPyBTZW12ZXIucGlubmVkKG9wdGlvbnMudHJhbnNmb3JtZXJWZXJzaW9uKVxuICAgICAgOiBTZW12ZXIuY2FyZXQob3B0aW9ucy50cmFuc2Zvcm1lclZlcnNpb24pO1xuICAgIFxuICAgIHRoaXMuYWRkRGVwcyhgY2RrLWFwcHN5bmMtdHJhbnNmb3JtZXJAJHt0cmFuc2Zvcm1lclZlcnNpb259YClcblxuICAgIHRoaXMuYWRkQ2RrRGVwZW5kZW5jeSguLi5bXG4gICAgICAnQGF3cy1jZGsvY29yZScsXG4gICAgICAnQGF3cy1jZGsvYXdzLWFwcHN5bmMnLFxuICAgICAgJ0Bhd3MtY2RrL2F3cy1jb2duaXRvJyxcbiAgICAgICdAYXdzLWNkay9hd3MtZHluYW1vZGInLFxuICAgIF0pO1xuXG4gICAgdGhpcy5naXRpZ25vcmUuZXhjbHVkZSgnYXBwc3luYy8nKTtcbiAgICB0aGlzLm5wbWlnbm9yZT8uZXhjbHVkZSgnYXBwc3luYy8nKTtcblxuICAgIGlmIChvcHRpb25zLnNhbXBsZUNvZGUgPz8gdHJ1ZSkge1xuICAgICAgbmV3IFNhbXBsZUNvZGUodGhpcyk7XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIFNhbXBsZUNvZGUgZXh0ZW5kcyBDb21wb25lbnQge1xuICBwcml2YXRlIHJlYWRvbmx5IGFwcFByb2plY3Q6IEF3c0Nka0FwcFN5bmNBcHA7XG5cbiAgY29uc3RydWN0b3IocHJvamVjdDogQXdzQ2RrQXBwU3luY0FwcCkge1xuICAgIHN1cGVyKHByb2plY3QpO1xuICAgIHRoaXMuYXBwUHJvamVjdCA9IHByb2plY3Q7XG4gIH1cblxuICBwdWJsaWMgc3ludGhlc2l6ZSgpIHsgICAgXG4gICAgY29uc3Qgc3JjZGlyID0gcGF0aC5qb2luKHRoaXMucHJvamVjdC5vdXRkaXIsIHRoaXMuYXBwUHJvamVjdC5zcmNkaXIpO1xuICAgIGlmIChmcy5wYXRoRXhpc3RzU3luYyhzcmNkaXIpICYmIGZzLnJlYWRkaXJTeW5jKHNyY2RpcikuZmlsdGVyKHggPT4geC5lbmRzV2l0aCgnLnRzJykpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgc3JjQ29kZSA9IGBpbXBvcnQgeyBBcHAsIENvbnN0cnVjdCwgU3RhY2ssIFN0YWNrUHJvcHMgfSBmcm9tICdAYXdzLWNkay9jb3JlJztcbmltcG9ydCB7IFVzZXJQb29sLCBVc2VyUG9vbENsaWVudCwgVmVyaWZpY2F0aW9uRW1haWxTdHlsZSB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1jb2duaXRvJztcbmltcG9ydCB7IEF1dGhvcml6YXRpb25UeXBlLCBVc2VyUG9vbERlZmF1bHRBY3Rpb24gfSBmcm9tICdAYXdzLWNkay9hd3MtYXBwc3luYyc7XG5cbmltcG9ydCB7IEFwcFN5bmNUcmFuc2Zvcm1lciB9IGZyb20gJ2F3cy1jZGstYXBwc3luYy10cmFuc2Zvcm1lcic7XG5cbmV4cG9ydCBjbGFzcyBNeVN0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBwdWJsaWMgdXNlclBvb2w6IFVzZXJQb29sO1xuICBwdWJsaWMgYXBpOiBBcHBTeW5jVHJhbnNmb3JtZXJcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU3RhY2tQcm9wcyA9IHt9KSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICB0aGlzLnVzZXJQb29sID0gbmV3IFVzZXJQb29sKHRoaXMsICdjb2duaXRvJywge1xuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgcGhvbmU6IGZhbHNlXG4gICAgICB9LFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlXG4gICAgICB9LFxuICAgICAgc3RhbmRhcmRBdHRyaWJ1dGVzOiB7XG4gICAgICAgIGVtYWlsOiB7XG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHVzZXJWZXJpZmljYXRpb246IHtcbiAgICAgICAgZW1haWxTdWJqZWN0OiAnVmVyaWZ5IHlvdXIgZW1haWwnLFxuICAgICAgICBlbWFpbEJvZHk6ICdIZWxsbyB7dXNlcm5hbWV9ISBZb3VyIHZlcmlmaWNhdGlvbiBjb2RlIGlzIHsjIyMjfScsXG4gICAgICAgIGVtYWlsU3R5bGU6IFZlcmlmaWNhdGlvbkVtYWlsU3R5bGUuQ09ERSxcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJwb29sV2ViQ2xpZW50ID0gbmV3IFVzZXJQb29sQ2xpZW50KHRoaXMsICdjb2duaXRvLXVzZXItcG9vbC1jbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHJlZnJlc2hUb2tlbjogdHJ1ZVxuICAgICAgfVxuICAgIH0pXG5cbiAgICB0aGlzLmFwaSA9IG5ldyBBcHBTeW5jVHJhbnNmb3JtZXIodGhpcywgJ2FwcHN5bmMtYXBpJywge1xuICAgICAgc2NoZW1hUGF0aDogJy4vc2NoZW1hLmdyYXBocWwnLFxuICAgICAgYXBpTmFtZTogJ215LWNvb2wtYXBpJyxcbiAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcbiAgICAgICAgZGVmYXVsdEF1dGhvcml6YXRpb246IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogQXV0aG9yaXphdGlvblR5cGUuVVNFUl9QT09MLFxuICAgICAgICAgIHVzZXJQb29sQ29uZmlnOiB7XG4gICAgICAgICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgICAgICAgIGFwcElkQ2xpZW50UmVnZXg6IHVzZXJwb29sV2ViQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgICAgICBkZWZhdWx0QWN0aW9uOiBVc2VyUG9vbERlZmF1bHRBY3Rpb24uQUxMT1dcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICB9XG59XG5cbi8vIGZvciBkZXZlbG9wbWVudCwgdXNlIGFjY291bnQvcmVnaW9uIGZyb20gY2RrIGNsaVxuY29uc3QgZGV2RW52ID0ge1xuICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTixcbn07XG5cbmNvbnN0IGFwcCA9IG5ldyBBcHAoKTtcblxubmV3IE15U3RhY2soYXBwLCAnbXktc3RhY2stZGV2JywgeyBlbnY6IGRldkVudiB9KTtcbi8vIG5ldyBNeVN0YWNrKGFwcCwgJ215LXN0YWNrLXByb2QnLCB7IGVudjogcHJvZEVudiB9KTtcblxuYXBwLnN5bnRoKCk7YDtcblxuICAgIGZzLm1rZGlycFN5bmMoc3JjZGlyKTtcbiAgICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihzcmNkaXIsIHRoaXMuYXBwUHJvamVjdC5hcHBFbnRyeXBvaW50KSwgc3JjQ29kZSk7XG5cbiAgICBjb25zdCB0ZXN0ZGlyID0gcGF0aC5qb2luKHRoaXMucHJvamVjdC5vdXRkaXIsIHRoaXMuYXBwUHJvamVjdC50ZXN0ZGlyKTtcbiAgICBpZiAoZnMucGF0aEV4aXN0c1N5bmModGVzdGRpcikgJiYgZnMucmVhZGRpclN5bmModGVzdGRpcikuZmlsdGVyKHggPT4geC5lbmRzV2l0aCgnLnRzJykpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdGVzdENvZGUgPSBgaW1wb3J0ICdAYXdzLWNkay9hc3NlcnQvamVzdCc7XG5pbXBvcnQgeyBNeVN0YWNrIH0gZnJvbSAnLi4vc3JjL21haW4nXG5pbXBvcnQgeyBBcHAgfSBmcm9tICdAYXdzLWNkay9jb3JlJztcblxudGVzdCgnU25hcHNob3QnLCAoKSA9PiB7XG4gIGNvbnN0IGFwcCA9IG5ldyBBcHAoKTtcbiAgY29uc3Qgc3RhY2sgPSBuZXcgTXlTdGFjayhhcHAsICd0ZXN0Jyk7XG5cbiAgZXhwZWN0KHN0YWNrKS50b0hhdmVSZXNvdXJjZSgnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcpO1xuICBleHBlY3Qoc3RhY2suYXBpLm5lc3RlZEFwcHN5bmNTdGFjaykudG9IYXZlUmVzb3VyY2UoJ0FXUzo6QXBwU3luYzo6R3JhcGhRTEFwaScpO1xufSk7YDtcblxuICAgIGZzLm1rZGlycFN5bmModGVzdGRpcik7XG4gICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odGVzdGRpciwgJ21haW4udGVzdC50cycpLCB0ZXN0Q29kZSk7XG5cbiAgICBjb25zdCBzYW1wbGVTY2hlbWEgPSBgIyBUaGlzIGlzIGEgc2FtcGxlIGdlbmVyYXRlZCBzY2hlbWFcbnR5cGUgQ3VzdG9tZXIgQG1vZGVsXG4gICAgQGF1dGgocnVsZXM6IFtcbiAgICAgICAgeyBhbGxvdzogZ3JvdXBzLCBncm91cHM6IFtcIkFkbWluc1wiXSB9LFxuICAgICAgICB7IGFsbG93OiBwcml2YXRlLCBwcm92aWRlcjogaWFtLCBvcGVyYXRpb25zOiBbcmVhZCwgdXBkYXRlXSB9XG4gICAgXSkge1xuICAgICAgICBpZDogSUQhXG4gICAgICAgIGZpcnN0TmFtZTogU3RyaW5nIVxuICAgICAgICBsYXN0TmFtZTogU3RyaW5nIVxuICAgICAgICBhY3RpdmU6IEJvb2xlYW4hXG4gICAgICAgIGFkZHJlc3M6IFN0cmluZyFcbn1cblxudHlwZSBQcm9kdWN0IEBtb2RlbFxuICAgIEBhdXRoKHJ1bGVzOiBbXG4gICAgICAgIHsgYWxsb3c6IGdyb3VwcywgZ3JvdXBzOiBbXCJBZG1pbnNcIl0gfSxcbiAgICAgICAgeyBhbGxvdzogcHVibGljLCBwcm92aWRlcjogaWFtLCBvcGVyYXRpb25zOiBbcmVhZF0gfVxuICAgIF0pIHtcbiAgICAgICAgaWQ6IElEIVxuICAgICAgICBuYW1lOiBTdHJpbmchXG4gICAgICAgIGRlc2NyaXB0aW9uOiBTdHJpbmchXG4gICAgICAgIHByaWNlOiBTdHJpbmchXG4gICAgICAgIGFjdGl2ZTogQm9vbGVhbiFcbiAgICAgICAgYWRkZWQ6IEFXU0RhdGVUaW1lIVxuICAgICAgICBvcmRlcnM6IFtPcmRlcl0gQGNvbm5lY3Rpb25cbn1cblxudHlwZSBPcmRlciBAbW9kZWxcbiAgICBAa2V5KGZpZWxkczogW1wiaWRcIiwgXCJwcm9kdWN0SURcIl0pIHtcbiAgICAgICAgaWQ6IElEIVxuICAgICAgICBwcm9kdWN0SUQ6IElEIVxuICAgICAgICB0b3RhbDogU3RyaW5nIVxuICAgICAgICBvcmRlcmVkOiBBV1NEYXRlVGltZSFcbn1cblxuIyBEZW1vbnN0cmF0ZSB0aGUgRlVOQ1RJT04gcmVzb2x2ZXJzXG50eXBlIFVzZXIgQG1vZGVsKHF1ZXJpZXM6IG51bGwsIG11dGF0aW9uczogbnVsbCwgc3Vic2NyaXB0aW9uczogbnVsbClcbiAgICBAYXV0aChydWxlczogW1xuICAgICAgICB7IGFsbG93OiBncm91cHMsIGdyb3VwczogW1wiQWRtaW5zXCJdIH0sXG4gICAgICAgIHsgYWxsb3c6IG93bmVyLCBvd25lckZpZWxkOiBcInN1YlwiIH0sXG4gICAgICAgIHsgYWxsb3c6IHByaXZhdGUsIHByb3ZpZGVyOiBpYW0sIG9wZXJhdGlvbnM6IFtjcmVhdGUsIHVwZGF0ZV0gfVxuICAgIF0pIHtcbiAgICBpZDogSUQhXG4gICAgZW5hYmxlZDogQm9vbGVhbiFcbiAgICBzdGF0dXM6IFN0cmluZyFcbiAgICBlbWFpbDogU3RyaW5nIVxuICAgIG5hbWU6IFN0cmluZyFcbiAgICBlbWFpbF92ZXJpZmllZDogU3RyaW5nXG4gICAgcGhvbmVfbnVtYmVyOiBTdHJpbmdcbiAgICBwaG9uZV9udW1iZXJfdmVyaWZpZWQ6IFN0cmluZ1xufVxuXG50eXBlIFVzZXJDb25uZWN0aW9uIHtcbiAgICBpdGVtczogW1VzZXJdXG59XG5cbmlucHV0IENyZWF0ZVVzZXJJbnB1dCB7XG4gICAgZW1haWw6IFN0cmluZyFcbiAgICBuYW1lOiBTdHJpbmchXG59XG5cbmlucHV0IFVwZGF0ZVVzZXJJbnB1dCB7XG4gICAgaWQ6IElEIVxuICAgIGVtYWlsOiBTdHJpbmdcbiAgICBuYW1lOiBTdHJpbmdcbiAgICBudW1iZXI6IFN0cmluZ1xufVxuXG4jIERlbW9uc3RyYXRlIHRoZSBGVU5DVElPTiByZXNvbHZlcnNcbnR5cGUgUXVlcnkge1xuICBsaXN0VXNlcnM6IFVzZXJDb25uZWN0aW9uIEBmdW5jdGlvbihuYW1lOiBcImN1cnJlbnRseS11bnVzZWRcIilcbiAgZ2V0VXNlcihpZDogSUQhKTogVXNlciBAZnVuY3Rpb24obmFtZTogXCJjdXJyZW50bHktdW51c2VkXCIpXG59XG5cbnR5cGUgTXV0YXRpb24ge1xuICBjcmVhdGVVc2VyKGlucHV0OiBDcmVhdGVVc2VySW5wdXQhKTogVXNlciBAZnVuY3Rpb24obmFtZTogXCJjdXJyZW50bHktdW51c2VkXCIpXG4gIHVwZGF0ZVVzZXIoaW5wdXQ6IFVwZGF0ZVVzZXJJbnB1dCEpOiBVc2VyIEBmdW5jdGlvbihuYW1lOiBcImN1cnJlbnRseS11bnVzZWRcIilcbn1gO1xuXG4gICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odGhpcy5wcm9qZWN0Lm91dGRpciwgJ3NjaGVtYS5ncmFwaHFsJyksIHNhbXBsZVNjaGVtYSk7XG4gIH1cbn0iXX0=