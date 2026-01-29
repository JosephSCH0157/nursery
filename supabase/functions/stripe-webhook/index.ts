Deno.serve(() => {
  console.log("stripe-webhook reached");
  return new Response("ok");
});
