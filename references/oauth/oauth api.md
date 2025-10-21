# OAuth API

Start the flow by opening the OAuth endpoint in the user’s browser. The `{provider}` segment selects the identity provider, and the `state` payload lets you pass metadata such as the requesting extension ID.

```
GET https://ohauth.vercel.app/oauth/{provider}?state=${encodeURIComponent(JSON.stringify({
  extensionId: '<EXTENSION_ID>'
}))}
```

Supported `provider` values:

- raindrop
- google

After the user signs in, the extension receives a single external message. Handle it with `chrome.runtime.onMessageExternal` to capture the issued tokens.

```js
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // message = {
  //   type: 'oauth_success',
  //   provider: string,
  //   tokens: {
  //     access_token: string,
  //     refresh_token: string,
  //     expires_in: number
  //   }
  // }
});
```
