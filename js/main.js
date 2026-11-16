// Start-up: load the save, draw the map, open on a useful view.
(function () {
  'use strict';
  var Game = window.Game;
  Game.load();
  window.MapView.init(document.getElementById('stage'));
  window.UI.init();
  window.EconUI.init();
  window.WarUI.init();
  window.Designer.init();
  window.ProdUI.init();
  window.NavyUI.init();
  window.DiploUI.init();
  window.BuildUI.init();
  window.StoryUI.init();
  window.PolUI.init();
  window.MilUI.init();
  window.ComUI.init();
  window.Visuals.init();
  window.Feel.init();
  window.HoiUI.init();
  window.Hoi2UI.init();
  // On a wide screen, open with a province already selected so the panel shows what a click gives you.
  if (!window.matchMedia('(max-width: 720px)').matches) {
    var start = (Game.player && Game.capitalOf(Game.player)) || Game.provinceByName('Paris');
    if (start) Game.select(start.id);
  }
})();
