<script>
  let brightness = 1;
  let overlay = 0;
  let color = "#ffffff";
  let r = 255;
  let g = 255;
  let b = 255;
  let rgbColor = `${r}, ${g}, ${b}`;
  let rgbaColor = `${rgbColor}, ${overlay}`;

  $: {
    r = parseInt(color.substr(1, 2), 16);
    g = parseInt(color.substr(3, 2), 16);
    b = parseInt(color.substr(5, 2), 16);
    rgbColor = `${r}, ${g}, ${b}`;
    console.log(rgbColor);
    rgbaColor = `${rgbColor}, ${overlay}`;
    console.log(rgbaColor);
  }
</script>

<style>
  main {
    font-family: sans-serif;
    text-align: center;

    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    padding: 5vmin;
  }

  .wraper {
    margin: 0;
    padding: 0;
  }

  .container {
    filter: brightness(var(--img-brightness));
  }
  .secondcontainer {
    height: 320px;
    width: 640px;
    background: linear-gradient(
        to top,
        rgba(var(--rgbaColor)),
        rgba(var(--rgbaColor))
      ),
      url("https://loremflickr.com/640/320/map,europe/all?lock=77") no-repeat top center;
  }

  input[type="number"] {
    width: 35px;
  }
</style>

<main style="--img-brightness: {brightness}; --rgbaColor: {rgbaColor}">
  <div class="wraper">
  <div class="container">
  <img src="https://loremflickr.com/640/320/map,europe/all?lock=77
" alt="random">
</div>
  <h3>brightness: {brightness.toFixed(1)}</h3>
	<input bind:value={brightness} type="range" min="0" max="10" step="0.1">
  <input type="number" bind:value={brightness} min="0" max="10" step="0.1">
  </div>
  <div class="wraper">
  <div class="secondcontainer">
  </div>
  <h3>color overlay: {overlay.toFixed(1)}</h3>
	<div></div>
  <h3>color: {color}</h3>
  <h3>rgbaColor: {rgbaColor}</h3>
  <input type="color" bind:value={color}>
  </div>
</main>