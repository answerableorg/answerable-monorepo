/**
 * Measures the scrollbar's gutter (kept by `scrollbar-gutter: stable` on the
 * root, and left out of `100vw`, so CSS cannot see it) into `--gutter`, and the
 * frame into `--frame`. It reads the body's laid-out width, not
 * `clientWidth`, which reports no gutter while the page fits the window even
 * though the gutter is kept. The scrollbar may not exist yet when it first
 * runs, so it measures again once the page has loaded, and on resize, since
 * zoom changes the gutter.
 */
export const FRAME_SCRIPT = `(function(){var r=document.documentElement;function f(){var g=innerWidth-document.body.getBoundingClientRect().width;r.style.setProperty("--gutter",g+"px");r.style.setProperty("--frame",(g||16)+"px")}f();addEventListener("DOMContentLoaded",f);addEventListener("load",f);addEventListener("resize",f)})()`

/**
 * Turns the /new stage on before first paint: `data-stage` on `<html>` is what
 * the `stage:` variant and the snap points key on, so without JS the page stays
 * a plain column. The page always opens on the hero, as the loop expects.
 */
export const STAGE_SCRIPT = `(function(){var r=document.documentElement;if(matchMedia("print").matches)return;r.setAttribute("data-stage","");try{history.scrollRestoration="manual"}catch(e){}})()`
