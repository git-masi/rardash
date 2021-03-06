import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import ReconnectingWebSocket from 'reconnecting-websocket';

const { HTTP_API_ENDPOINT, WEB_SOCKET_ENDPOINT } = process.env;

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: HTTP_API_ENDPOINT,
    prepareHeaders: (headers, { getState }) => {
      // By default, if we have a token in the store, let's use that for authenticated requests
      const token = getState().auth.clientToken;

      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }

      return headers;
    },
  }),
  endpoints: (builder) => ({
    createClient: builder.mutation({
      query: () => ({
        url: 'clients',
        method: 'POST',
      }),
    }),
    getOrders: builder.query({
      query: () => {
        console.log('%cfetching orders', 'color: darkSeaGreen');
        return { url: 'orders?asc=false&limit=5' };
      },
      // keepUnusedDataFor configuration for an individual endpoint, overriding the api setting (if it exists)
      // when the time expires the component will unsubscribe which will have the side effect or closing the WebSocket
      keepUnusedDataFor: 5,
      onCacheEntryAdded: handleOrderCacheEntryAdded,
    }),
    createOrder: builder.mutation({
      query: (body) => ({
        url: 'orders',
        method: 'POST',
        body,
      }),
    }),
    updateOrder: builder.mutation({
      query: (body) => ({
        url: 'orders',
        method: 'PATCH',
        body,
      }),
    }),
  }),
});

export const {
  useGetOrdersQuery,
  useCreateOrderMutation,
  useUpdateOrderMutation,
  useCreateClientMutation,
} = api;

async function handleOrderCacheEntryAdded(
  // In the documentation example this arge is a specific "channel"
  // that the ws is subscribed to
  // The channel is passed as an argument to the query like so:
  //    query: (channel) => `path/${channel}`
  arg,
  { updateCachedData, cacheDataLoaded, cacheEntryRemoved, getState }
) {
  const token = getState().auth.clientToken;
  // create a websocket connection when the cache subscription starts
  const ws = new ReconnectingWebSocket(
    `${WEB_SOCKET_ENDPOINT}?authorization=${token}`
  );

  let wsTimeout = null;
  const keepAliveBody = { action: 'keepAlive' };

  // This may be where we try some kind of fallback logic or at least display
  // a toast or something to indicate there was an error with the connection
  ws.addEventListener('error', () => {
    console.log('%cWebSocket error', 'color: tomato');
  });

  ws.addEventListener('open', () => {
    console.log('%cWebSocket open', 'color: cornflowerBlue');
    keepAlive();
  });

  ws.addEventListener('close', () => {
    console.log('%cWebSocket closed', 'color: coral');
    cancelKeepAlive();
  });

  try {
    // wait for the initial query to resolve before proceeding
    await cacheDataLoaded;

    // when data is received from the socket connection to the server,
    // if it is a message and for the appropriate channel,
    // update our query result with the received message
    const listener = (event) => {
      const data = JSON.parse(event.data);

      console.log('data', data);

      // Do not update cached data if we get a keep alive message
      if (data?.action === keepAliveBody.action) return;

      updateCachedData((draft) => {
        const orderIndex = draft.findIndex((order) => order.sk === data.sk);

        if (orderIndex === -1) {
          draft.unshift(data);
        } else {
          draft[orderIndex] = data;
        }
      });
    };

    ws.addEventListener('message', listener);
  } catch {
    // no-op in case `cacheEntryRemoved` resolves before `cacheDataLoaded`,
    // in which case `cacheDataLoaded` will throw
  }
  // cacheEntryRemoved will resolve when the cache subscription is no longer active
  await cacheEntryRemoved;
  // perform cleanup steps once the `cacheEntryRemoved` promise resolves
  ws.close?.();

  function keepAlive() {
    if (wsTimeout && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(keepAliveBody));
    }

    // WebSocket closes after 10 mins of inactivity, 570000 = 9m 30s
    wsTimeout = setTimeout(keepAlive, 570000);
  }

  function cancelKeepAlive() {
    if (wsTimeout) {
      clearTimeout(wsTimeout);
    }
  }
}
