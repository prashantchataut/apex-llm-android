/**
 * Runs in <head> before React hydrates, so every entry point lands on the right static route:
 *   /admin  /apex-llm-android/admin  /#/admin  /?admin=1   ->  <base>/admin/
 *   /#/app  /?app=1                                          ->  <base>/app/
 * (GitHub Pages and the Android WebView both serve a pure static export; there is no server-side router.)
 */
export function routeScript(base: string): string {
  return `(function(){var b=${JSON.stringify(base)};function go(){try{var l=location;var p=l.pathname;var h=l.hash||"";var q=new URLSearchParams(l.search);
var onAdmin=/\\/admin\\/?$/.test(p);var onApp=/\\/app\\/?$/.test(p);
var wantAdmin=h.indexOf("#/admin")===0||q.get("admin")==="1";
var wantApp=h.indexOf("#/app")===0||q.get("app")==="1";
if(wantAdmin&&!onAdmin){l.replace(b+"/admin/");return}
if(wantApp&&!onApp&&!wantAdmin){l.replace(b+"/app/")}
}catch(e){}}go();addEventListener("hashchange",go)})()`;
}
