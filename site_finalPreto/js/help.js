/*!
 * Help2See - Accessibility for Everyone
 * Version: 3.5.0
 * License: MIT
 * https://help2see.io
 *
 * Help2See 3.0 — internal architecture (single standalone file, no build step):
 *   Utils      → DOM / style / throttle helpers
 *   Store      → config + state + localStorage persistence
 *   Styles     → injected CSS (visual identity preserved)
 *   Features   → single-source feature registry + apply logic
 *   Effects    → mask / guide / magnifier / hover & keyboard readers
 *   Speech     → TTS + voice navigation
 *   Profiles   → one-click bundles
 *   UI         → widget build, panel render, delegated events, focus trap
 *   Observer   → self-healing MutationObserver for SPAs
 *   Speech     → caching-first TTS engine (cost-optimized ElevenLabs pipeline)
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Help2See = factory());
})(this, function () {
  'use strict';

  // ============================================================
  // CONSTANTS & DEFAULTS
  // ============================================================
  const VERSION = '3.5.0';
  const STORAGE_KEY = 'help2see_prefs';
  const WIDGET_ID = 'h2s-widget';
  const PANEL_ID = 'h2s-panel';
  const TRIGGER_ID = 'h2s-trigger';

  // ============================================================
  // BRANDING (icon) — reuse the EXISTING Help2See logo asset.
  //
  // This is the same eye mark shipped as the site favicon/header icon
  // (img/logo_icon.png). It is embedded here as a base64 data URI so the
  // plugin shows the real Help2See brand on ANY host page without a broken
  // relative path. No new branding is generated — the original PNG is
  // reused byte-for-byte. Used by the floating trigger and the panel header.
  // ============================================================
  const LOGO_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAI4AAACOCAYAAADn/TAIAAAACXBIWXMAAAsTAAALEwEAmpwYAAAsLklEQVR4nO2de5xkVXXvf2vvfR717OfMdM+bAYcBgeEhODAi75caBQwmiqNEiXiVe+M10UQT9aPmGo3XRGMSE72YBEwQjYgXELziA4Igw3N4DTAwzAzz6u7pV73Oa++97h+nqqeZme7pKRpm4HO+n8/5VFdX1alTp35nrbXXXmsXMTMyMg4UcbAPIOPVSSacjLbIhJPRFplwMtoiE05GW2TCyWiLTDgZbZEJJ6MtMuFktEUmnIy2yIST0RaZcDLaIhNORltkwsloi0w4GW2RCSejLTLhZLRFJpyMtsiEk9EWmXAy2iITTkZbZMLJaItMOBltkQknoy0y4WS0RSacjLbIhJPRFplwMtoiE05GW2TCyWiLTDgZbZEJJ6MtMuFktEUmnIy2yIST0RaZcDLaQgHAl7/wBBzXBSNCUAdyOQXlSGhtQEQgMABCzpeIE4sosiBiOK6ElATHkWBmKEUolBWM2b0gJTOQzys4jgNYII4TPLV+DD29OVhrIIVAklhobSGVAMBgC5AAwsCAGfC8VN9KCjQCAyEYpbKDRt0gigwAgucJJLEFCGAQrGUIAgiAl5dQQiEMYmiNOYZ5kU54maNEPxH1JolZZCwWWsN5AFCK6pbtuKPEkFJiII7NNscR26WkF0hguxA0IqVAFGtIQUgSBgiwhuG4AlIQSAC1qoFO0nPh5ySMttCGISWQ8w0AhpIEYxmuQ0g0QypCPk+o1yw8j2AsEEeEWjVAGBJKhRqYgVi7iGMPvV3bUcjHoGm+ZJ0AC5ZanHq2RaxDgAEhFQgKjluC0aMALJRTRhzuhOt2gGGhZAkgFwIB2O5C3p0HYyRy5bemwnmtQdTaSOrEHmnr5pQo0qdHoT7GWhxmDM8BAGYGc/rcF5FeJ2gtyNrcFwBYKWlQCNriuvS4kPSA54l7ADxJhGSv/byGec0IhwgQgmAMz0u0PTOKzJla82qt+Si2rNLn0ISoWvcPEGEM9xnDfXHMpwD4ABFZqegp1xW/lhK/UI74hRA0DnptLwP8qhdO87sXUWTPrtfMmigyFxnLc8C7RUJi9kzBPkQnjOajG4k5GsQfCRp2cy4vbs7l5A+IcC8R9GtxKelXpXBa1oUZc4PAvjOK7B/oxJ7MTBACENQMbl7B40l1RDCGl1Qr+upaRV8tlXhEKvq+FPQjIjz7yh3Ry8+rSjipYABjuH94KPrQ6GhylTHcn7og2jtWOUjH2LJGxvDxxvDxRPgLBq53lPg6EZ48yIc4K7xqhCMEoDXPb9TNB2s1/RFjuE8IgniJbqjlRpgZhHREBjCIWmNJ7L5l3n2nSUsk+xLtpP8Vw8D8YUTmcuWI7/i++DoRNr2aXdghL5zmyXeqVf2R8TH9KWt5nhAEKdsQDDdHUs27QlDoOLRNCNriemKL0bzF88Ww56pqvR4lrpKcvoyhtSXPd4SQIl+vJd0M9IOxOI7tYcbwQmu5s/W7GPuyfs37+SS2f6QTu4Yt/rpYpK8TIWrvzBxcDmnhkCAkkX3z+Fj0V1FoT6M2LAw3xQIAUtK468onfF/e4zriNwAeKxZz2+IIYbEssWtXiEJBIJ/3YAyQ81QqNmJEoUGpw4fjuWAbwvUMBBGMsUJr28fA63TCJwZhskonvFJrexgzu8CLRdT8u7taxZfDkH+vqwufVg5uPxTc7IFwSAqHiMBs542PJX8ZhfZKABAHaGGY00SiVDSayzm/yuXVf3oe3SWk3OYoB2CBer2Ban0LhoaehdylMTi0EZ6rkOgYUZhASgHf8xDFMZgZ5Y5elIr9iEMPc+eugO+WoaRvwXo7SbM9nxN3+jkBIYQbx3ZZtRKflSTmImP4dGZ0pp8tPb7U9eKEoSHc5vv43pw5+AQRds7umXz5OOSEIwShXjNvHx2Nv6ETu/RALYy1qXXxPPlYqez8a6GofsAGW4WUEMJBFNcwOrYBwyPrMV7ZhHpjO4wJIKSCNRau46HeqEEbA0EChXwOQRRBSolKfUP6hScaW7Z3wfc60Tf3ROT8BejuWg4iF8wWAGKp6CnHpaeElN8C00Jj7FuM4XdrbU+zFu7kfFIQ4L07d/CppTI+Uizh/83uGX15OGSEk05toHNwIPxG0LDvA3BAbqklmGLRuaPc4X5dSvq564kYENAsEUUjeGH73RjatQ5BOAhjNKRUAGQfs3pTHNnVWuujw1B3WsuKmcAE1OqRtdbWraQXpKRHXdf9rZTykSSpVRNdw+iGjcjl8sj787Gg743oKB8HKTqgddR0kwABWx1HfDtfEN+WIl4RRfw7YYg1cYxj088JJBqHDw/jdq3xt339+PShHvscEsIRAghDe8LgQPIvUWRWHkjg24ph/Jy6p7vH/VK55N2qjUUYGBC5SJIaNjz3M+wYXItabRC5XBFCuK4x9JYwjN+TJME5zLZ78j5bIyVmhjEGACZugyCAEGKLUuo213Wvd1TuTikcjFc3o1LbjFrlepx5xpXo7T4Fm0ZGoFQ6b9USkRB4Kp/HU52d9I3xcVwaBPzfowinNc8DjY3xx+OYV3V24QpfYIOxs3OOZ5uDLhwhCGNjes3IcPwNa7nrQERjLcN15dOFovpCqeze4LpkrGUwC0gpMbTrYTyx/kdoBEMgknBUvpAk5qo4Dv7AGHMM0BoBTf2e+3qMmRfHcXxVHMdXKaXuZOZ/Vsq7XgjCyOizWLB4GL/3rn7c+UuJ3/5mGFFkJyZq0+MGAMSOg+97Ht1gLV/QaODqRgNvJQKCAKfFMe7EPHw8l8P3Z3xCXkEOWllFK/s7OBB+eddQdC0zumbqmqxlWMsolpyv9S3In5rLqf9gZmMtQ0oXzDHWP3Mdnlh/LYJwBI7KgZneGkbhb4Mg+Jox5pj9CWb/x5++Xmt9RrVa/Y9qtXp7GITHas2II0YuR7jwrfNw5YcPw5LD8ggDM+FOWzStEDsObp8/n962eDGdl8vhVwBgNPp37uDrh4fxeXEIFr8clEMiIhjDPYMD4Q9GR+M/FWLmWV9jGH5Oruvrz19Q7nD/BMCo5TQrp2QOY5VNePjRv8fA0FoI4UJKxwuC4GuNRuMWZn7Jgpn8Gay1qNfrqNfrMMZcIKS8e9myw65asmTxxPMWLs7hDz98GC58Wx+EIMTx3r6HObVCuTzd0dODs3t6cJmfw4PMwNgof3ZklH/EjI6XfNCzyCvuqkgQrOUF27c1fhwG5uSZuqZWLJPLyxvn9uU+4DpyvFZNAAcgUhBC4YXtd+G552+BtTEcJw9rbU8QBNfHSXyeoNm9RqrVKsrlMi6++B129erVdtmyw7izs7Psed4/KaWOBPBZADUAkIpw5jlzcORRJdxx+wt4fmMVnrf3qbc23fJ5/GdnF90yOsJXj4/jM/UaLlXKma+kfgfAg6/oRNwUvKLCEYKQxHb5+FjyEwArZioaaxlCUNTd4326UJJ/k55gbu7TgbVVPPPszRjcdT+EcKGUhySJl46Njd9ojDnhQESTXv2MydMBUu6OdVpW5qKLLrRXXvlBs3DhwskvT5Ba8f8J4EwAVwB4tPVg/3wfl19xBO69exBr790JrRmuu/exWQswI+zowP+2lm9t1M2X4sS52LK8g7l+KZE96BOmr5hwlCKMjcQrnnhs9BYAh880njFpVd2W/gX593uu+HUQJhNuTUofcVzB089eg2ptM5TKgRlIkqRcqVR/bIw5fiZuKUkYUZSKo1AQKBUFHDeNw4wGqlVGrWZAsACF+NjH/si8+92/P9V4xza3EwDcAeBiAPe0HhSCsPrN87BoSR43/3gbRnYFyOX3LWxrASJa73vhJY6K3hdE+a+P1zrXFnKVc4n4oRmdwJeJV0Q4SgrUq3r5o48M/yxJ7OIDsTS+L+5asqz0fhBt0rGZeEwKH9XaU9i87SaE4SBctwQiIAzD3Ojo6PeZeVrREAFRyEgSskuWuHTCSQ4df6LAwkWEYpHgOAwiC60FqlXgmaeIf/XLXXTM69dMJ5rJJADmALgJwFkAnpj84OIlJaz5g8Pxf2/cjE0bK8jnp/4qGATXja51nfjOaqP87Vqj4w7fa/wOwL+ZwXG8LMy6cFoZ0ZapV4pQrSbLn3xs/PYDEY0xjFLZ+fbcebmrpRSJ1ru/K6VyGKs8jfXPXANGDCFcGKMhhEAQBF+x1l4kphmKMAOVKvPrDhf196zx7CmrnFK+aKGNhU4YxgLg9DilY5AvMhYu1nTuBUu56F1xIJmVlniuB3AamjFPi3KHg3ddvgy3/mQztjw/DiHlNMdMEMSbC379gihx/0cjLN7qOtEaQfbmAzieWWP2hNMUy9hoAjChVHZgLWO8qhdu3lj7aRLbw2YimlaMMa8/9xnPE3/ZqgtuIYWL8fEN2DHwE+TzDoQoIC2DEBgdG72w0WhcPZVoiIA4BnSC+JJLnMaVH3Z9P09+o25QrU76IHtgLSGKQ5Tz51rAO9AzkwA4FsAXkcY+L8J1BS657DCsvXcnfvubHWAW044wGYBSyd/liB+OE++fgqhQLBZGrp84bt77xULwxETvbDHrFidoWAgS6OgQiBM9d8vz9Z/EsT18ZqJhCEG1rh7vQ9093vW1aoLJH1cID1G8Gc9v+Q8QGSjHB5AKwlrbXa1W/5mm8E+pG2N0lKn+J3/m65NXyVKjwbJem8kJZRDl4bunt3v2DYCPArgGwOP7esIpp/YBAH7xsx1wvf0E80wQwv5X3q9fWKl3/61lN3RV/GNjJRwZNWuKdpPEwNIVBiQqbR7+3rwsrkoIQBvbsfn56k1RZE6ciWisZRBhy4JFhcuEpLVav/g7IlII4xFs3HQTkqQBIVwAMQCGEBKjY6NXx3G8WE5h7qOIUSpS8JWv5ezSw0VHtXogGjCQ1MlSzGlXOBaAA+C/A7hqqiedcmofajWL++7ZCT+3n6+GCSTsC54TvbveKHyqYksRs/hpzq3uJZw4FPALCYhmTzizngAUgmCZ5z/z1Pjt1ao+dUaiMYx8Qd3Z158/U0paa/eIIpplFnh+y42oN7ZBSm8icyuEgDG6r1at/Y+pXJSxgBQU/flnfb1kmShVKgf2/TMAkANg6hhkhru5DEDfdE8685x+HLuyC2Fgpnva5N0mOa/xRSnsHCnMGYKYBDEmb2CGmenuZsisCkcIgjW8cGBHcGujrlfNRDRGMzxf3N7V7b3VccXze4oGAIR0sGXrT1GrbUYuV4bjOBOb63oIgvByrXXPvrwUEdCosf3gh9zoxFNkqVrjNmuTW6PsttEAugCcM92ThCC87eLDcOSKebA2bVDcH8zEjhP/Wz5XqztuIl03Rmsj0ujoDtHdE8POonhmzVVJSajX9akDA+F1SWxmFNMYw+ie4/1DLi//hJlD5r2nHpTMYefOddix816AHLDWkx5lEJFTrVYvnyrJFwSMo4+RwVt+x8lXqnsa8ZlBEGBukOUQknJt7GE3lUrl3HvvvfffBRGmygCTABpRgEbQASF6ZrRfZoIS+gEhDbgZIMeRQN/8AKedPYL++Z2Io9mzE7MiHCGARt2884Ut9e8SqLy/5F5r+qDc4XxuyWGFLwwNhPu8ltPCq0E88+yPkSQmrc+ZPDoggjFmSZIkx07VO2UM9Hvf51rlQMVJ258Q1lZgzBaSouslDU9uuOEH537zm39fLhaL0wYczDGOXP5mHLnsA6AZOobWZcFMMIZw1Moq3nBaBa6bQCezO03xkoTTbHajXUPR54aHo8/NpEWFLcDEjcOOKF+lE/O9Znp9732DwGyw6YXbEMWjUDK3+00n3p+gtT6SmdW+3FQUASuOkuGJb5B+ELy04SjDIIx/Q66zsu0dBUGgb7/9ZwuPOOJ1JxWLxV81qwWngBDGL2DrzlvR1332jN/DGgIzcMxJm/CG0wJY3QGtCdJt96j3Tdu2SwiCtVi0Y3tw6/Bw9LmZzHBby5CKBufM9d/W3eN9b88yg8lI6WNoeC0Ghx6Go/ITwfDkTQiBJEneOFWOIomZzzxLGdeD81LTGIJyaER3SGMH297HDTf8gDZt2gSAT2Vws3d9qs1CSRej4w9irLoeUvhgTt27NQSdMOI4LeFIYiCJBeJYQDnAGRduxIqVm6ETiX3FjGkBvQSRApHTvH3x36k0pv5CD9jitDLDYWjWjI9HXzKGF85k3skahuOJtYuWFK5MYn7MTFPaJoRCvbEDOwZ+CaW8aQTJiKLozVNNLbgu2aOPEV4cz0byS4K5hvHa38qu8hcMwTmgVz/99NN07bXXyVKphCAITpFK7TcpRwAsG2wbvAO+W0Ip341CSSKODTo6fZRKEiQEkjiA4VFYo3HSqm3o6a1jrCLhOZO/ekpFAQVrw2VJUjmWbXBSGNaOZTTmEKwS0h0By2cYXeukLD8OWXiMyAvB8V7HNmPhtAqv4sSuHh2NPxdF9rz0qt9/PGMto7PL/U53j/9HyqEgCvU0r0hb4DZsvAXGBJBy6kytZdujtT5mX48ZA5TKSHp6BPR0b3cAEBUQJmvFaPWL6Cr+uSGaWRb5ySefpE9+8s9kkiTwPA/G2KOY2UGaVZ4SBkAkUa0N46iVYzju9Tl0z12IRv15dHSUoVwBx1Go1ytI7CYYE0EKiyR8sSNJLQiKSbLj0iTZ+j5jR05lTvJCNCsMiEDEsNYCxBcZsxFEhEjmn3HdpTd7zpLvCfIeIXLQGllOK5yWWAhAFNvTKpXwqmpVv5cZYkZWJnVNu3rn5v603OF+l63FtG4dgJQedo08gG3b7odSPtIk375h5rnW2vK+LI61QLmDuFCC3Le5bgeGoDLC+B4xXPk4lfMfMtPFPJVKBbfccou45pp/kXEcw/d9MFsw2zlKym4SYmB/76i1wfz583Ha6hWAGYSUBKnSwUUSp25NJ0BiROpd9OQhvAQgClrvfG8cPvJxa0eXgwRAMk2gEjdn/NOKekESRAxBLogMiGvLTXzvH4fxf/2xFL2/cLDqG6AldwMYnRCOEASLSQ30BMcYPrJeT86LQvOuKLKr0mLrGQTAzZ6mXEH9qG9+/pNE2Ggt7zclkVYGxnh6w21oNAJIOX3igZnzwL59BjPgKCIpQLNb8M0QVEKin6Phyp8qzznJ+t4ZrORiJrggAkdRnb57zS/o5z+/U+zcuZMKhXxTNGmlIjM7lcq4v7+CLAJQqzVw5hnHo6uzAwM7BuDz7sL3fa7rM/FKAWNGft8mz3yWefQokEBqIW3zqRaiKZp0jQYGiMGIYayGJDeWsvcpSYufdJz+5xxXJVrUTic90A3g3xQAGMMXj43FJwhhc0kMPwyTBdYmK5LELrc2HbHMaMTErQJy8Xyh6HyxUFT/IiVBazujck0pPWx8/tcYGd0IpTzs98TS9EECM8x+d9IWDKJ0nixKHhBhch8ICiAFIoYk4O676xgaInR0lCcC3t3HPbN3ieIEyw5fiDPOWIkommkuQQCk55MY/Uoc199LDBD5IBgw0pXUAIB4998gC8sBYIVx5Ny7PW/pD113wS+ELG0wyS7juMuQL/bBUoSo8hiApqvyc+IBa3FspcJXGsNdQJqbmUkMA+yuxpOSdvT0+v9Q7vS+1Qj0yFRD7X3CAkkyjp0Dv0JHqRNCqGkNFAGw1lZGRkdDZvb3epyAOGHSGhDyAI7jACHKTVJmq3dcwfcFHBVOEQBTUMjnq9MpiBlwnATvfs8lKJWKafwx/ZGASEDrsSsSPfhXQug+sAKj6Y7AE9tu6wIwApBBouTia4vFE/9RkvMQhIs0oWoATsAcgW0ApmjiMyoAEERby2X1RccVf2c03tFoJO+LY3sqM+d3L2dGE3U2e1w97Pny/lLJvbZQUD90XDEIIrDlSVaG0eqhftEcym63iHw+h+GRtXC9CI7Tif36NRCY7eDY+NiI1nb+nhZNCKBegwga4GJ5P7uaNQhSALUqY2TEQE4RQRJhexjFY1N/RkK9HuDkk4/CSW84GrsGt8IplqZ5XwEiqDje/k2txz4MFgArgCwIjFQiFsQWPJGxNrA2gCP7f1ounfUFy/F9UubAppaWZpCD6bI1Ex/NWgYB454nrs3nc9cCOKJeT44zhldpbY/V2s61ll0SlDhKDpOgDb4vH3QUPeT5ah0RWVBzP2K3YARZjCdlDFSKcISF66QLQnLdgdOhQV6C3vkuOnvy8Ab68NQzDMsRiPY/T0MkKlKp55NE71M41So7IyOcdHTTrE/yTYXjANu2AqOjGr6/z54sCKE2SCntlPknrbFw4Xy885KzoZPpXZQQCmC7oFF7+lpG/WzYZsgn0lJXplQ04OaFzAIWAYi9rZ3liz4h5dzvS1GCSbaAeeZZwr2uiZZFcZR41nXls45DNxIBjYZGo5EIP6e4WHDZWIZUAmzsxCKMk91aurqMwK5GNxo6jzARaFhAJQQpBbwQ6CpGsGygHIFEx1iy5HisPO5crHv0Dvh+fr8HLwTBddyHwkawes/HmqWh4un1NjnyaOXH0SuzGI3jAM88bZEkvE/hAIBS6iEp5ZR5nDhOcPE7zsfChX3Q0+QShPDQaOw8tlr59X9qXV8uyAPIpJYctummmm6aRPofW4PvLr015576YdfJbTW2AeYDz1dMaYtakXta8T9RhWfTOC9tiOM9ugFaECwsXFR4LupJDmA7yUXZ5tbyubvjD6NjLF5yCvr7lmFsbBSNRoBGozHlVq83IKX8DU1RTuG4RLfdGsso4FdkRVCitPblv+7ScKe4eIkIUor70mH5i7PFACMMIxx37OF40+oT0GiEU76XIBdBsPXtu3b+6FdxMroc8GGbYuHmbRrEpNWRzAbMEUqFkz7TWT737UK4W3kfib2ZMvv1OGQRWx9VngPNflMgM8OyheMonHvuu9HXtwhEBo6joKbZPN97gIj2ecl4HvDss9Z9+EEb5HIvv3JyeeD+tYT1T8TwvClmvomGXdd7xHFcuK4zaXNBJNDXNw9XXPFOWKunCOgJQniojD/ykeGhn9xoiXsYDhgWaIoRaF74YAAS1iZgG1e7O89/V7n8xr+0rC3zS/PdsyocIqASlzDU6AZDQcAe8FjYGA0/V8LJJ/8OHCd1V1IqSCH32gQJeK63yXXdh6Yy+0qRuu5fY2U09MtpdYgAHQt8/99jSLXvY2FmSCnXGmNG4jhGHCeI4wRJkiCKIkRRhHPPORldXR0wel9fLIEgEQTPfX68cvc/MKRkqAkL0zQwE8vSESSYI0jpbe3teetbXK//h6mVeelue9aEI2BRTYrYUelCEAFhzAhiIIiBKEEPM06fqYp0EqGnZylWvfFSWGsQRxG01vvcjNHG973rphKO5wFPP238X/xM10slelmG5cxAuUz46c3A44+HU8Y2AOD73r85jsTkTUqJJNE4/7zTsOqNRyMK9w6IiQSIpD80+LPvBY0nPguRTwfWbJpuqfWerVsJyxGE8Nd1d5x1hu8vvNva9l3TnsyacBhAaBw4ykBKCyl5YlOSx5Wwfdbg7TPdX5KEWLhgBc468zLkci5cz4Xv+3ttruuhs7PrBqXU0FTiyeVI/NO3Im/947ZWLM6ueJiBYhF49CGBa77TQLE41fMYUsqnHcf9v2l+iya2KEpwyilH46KL3rTPRB+RhDF6XqOx7sYw2nA5cy5dYq41f8NAa+QEMEAShkO4Ts/acmn1W4jcjcxtFyPtk9l1VWiZyD02gpaSf2gMdWhDV83UY8RJhCOPfAOOO/ZsJHFqday1e21CiKFisfCPU7srIIrgf+4vAueFTTaYLfEwA8USsGWTiD//uQDGmCkTpsyMQiH/Zdd1AqUUlFJwHAVjLJYs6cc73nEWmC3sHgcmhAutGysGd9z660QPXUTIAc0AuJXQS+MZSnM0JAA0UMgtvKd/7tsvEIK3v5QgeCpesdUqmAEh+bokQS6I8CWidDmz/RHHEY4+ajWOP+5sGJPA6ATpZOnuzRiNcqn8j0qpnfsSDzPg+8DYGHuf+kRIzz1jG+XySwt4iICODuKnHufGpz5RN5VKMmVAnKY31HpHuTckiYbRGsYY1GoN9M3rxeXvuQieK7FnqQkJB43GznNq4/fdkejxFQwPFhaWd6fk05vmEBgSUiaojHpPCFx8WRjNGYuixQD68RLrpffilV3mhAFH8dddaYcGh/imOMGCaZoXm69haB1j5cozcfaZl8H38xCCXlSw7igHvu8Pdnd3/9FUVocZyOUII6Ps/8nHAvnz23StVCTjHWh/HaX78T2Kb/qhrn7ifwZqdIxzudzUVoyZbUdn53/L5XOB7/vwczkAhNe9bhmu/uj70dlRgt4jGCbhIAx3fHBw++0/NRwvsM31BS0zLDXtzaQsflo6EYKQf8LEp14YNDq3V6tFxNERYF7QnHaYPV7xZU4sA51l/lspEvvsRrqn6PGajjLumu41DEaSRFi69HhorfDbtT9BI2jAUS5aqxYTgHwu9wM/l3tbGARr9tUq07I8SQLvy18K1W/vUdHvvcfFssOFJx3IOGFojRd1A7T6xBwHcBziKETy+Dob//u/Rfzgg6ZQKJJUYuq5MGstCoX8X7uue2crmReGERYt7McV77sUnZ0d2LWrilatPRFBSBfDww/9VaW6/s9ADtLCFj3hnojTmiUmTmtpIGBsANdRz/R0nv8Wk8itUhoQWRBZpP2As8tBWcrNGGDBXPuN/jk88uRT8va5vdHXXv968Zn9TajGcYjensV420UfwD2/vQmbtzwHz909v0lE6CiVPmq0Pkpr/YZ9L8OWxjzFIsm77tT5e+/VesWRMll1mgqOWynF3D6ShRJISVIMWKNZVyvA5k1Wr3vI2AceMHLjc8azDKfUQdOObNPf8FI3FwrFz7YmKeM4weJFfXjve96Ozs4OxJMq6IkkdBL17hq675/r9ecuhXDTIm0yE8pslqMDZJv3JQwHUFJsWrTw8ou6u4/b0jsvwpbN9YkyjpeDg7YGYKKBFUfQdYp0+NCj7g+MDt947Ov1R5WiDdPFPlon6O3txjsv/iBu//mNeOzx++A6HqSUsNZCKVUtFouXjY+P/xrAkumOIV8gMEM98aRRj6wz7HtkurpJz5lLUalInrVIKlU2Q4Psj46wn2hWnkfwWsPt/YjGcZwH5szpfY+SKrGWEUURjnn9clx6yfnw3HQI3rKMJBS0Do6rVh65TpvKcSRzACcgMpPcUfqmzIAlgiTZtDTus6874iNvL5aWbrRc3WvJuJeDg7p4ZJwA8/vED9noM59Yn9xy/33RQwvn6893lJ1vSkmRnuIEaJ1AqQJOW/U2dJR7cd/9d6BSrcB104CFiDbl8/m3NhqNm5j5iP0td+L7BN8HMUONjbEaHmbfGgYInhAEpQA/B/gzvHo5nVDcUCgULvNcr5YkCYgEzj57Nd60eiWUcpHEYXMNnrQWOAoGrmzUN3yVoTtBLpg1iCxasS8Rg5jTiWsBkJCwtgEp5UPd3We9s1hausmYALO88NiUHPRlCY0h5H2+c+UxyZsKPg++sFl89aH767+pjCdnKTV1PZCxBtYanLDyTbj896/GsmUr0AjqE8vKCiGe8D3vXCnllFnlPSFK3ZjnAbk8IZcjeF66ItdMaeZr1vm+dxERbQrDCLlcDhdd+Cacf/7psJYnHaMCsy3Xas9dU62s/45l7mSkdTDpXNaLR022VZ4CCaMryPtz757Tc9YFRGKTtbObp9kfB104QBrzdHSodSeudE4vFs2vxit00rNPx7/csin41yBMjpZy39WHzIwoCtDbOw+XvuP9WL3q/GbLTNy66jfncv7ZUsr/M9vLfOx9LBMxzbfy+fxZAD0XRTH6+npwwXmn4LhjlyMIwom4QwiFen3o/K1b77wrDLZ+ANSaFZ003zRxv/UuAgSC0WPoKB5+w6KFl76dhLPrpc47tcMhIRygufYv0faTTiq/pb/P+T/GEnbt0u9/cO3YfVs31/+XtTxXqX2vHZMKhXDqqvPwu5d8EPPnL0YYBjBGA8C44zh/6DjOGgCbXw4BNZdnWZfL+W/xPPcjSZKMGmNw1lmn4uJ3nIlCwZsIgtOCcFEaHd3wlYGd9/wsCsdWpmXTtjmDvXumPO1ebBW7CYAYxtbQ033il+f1nfv7UrqjPJsN4QfAISMcoNkV4Yiwf578w4X9/p8RichYLm7bGnz6sUdGHt62tfopY3i+UmIvF8ZsEUUB+vsX43cv/gDe9btXoLOjG0HQgNYJhJDf83P+ya7jfBlEA3vWAR8ordcT0ROe5308l/NPZebb6o0G+ubNxYc+tAbnnru62URnQSQgSCEIhi8Z2Ln2N/X6C59kTpviGKYpmuZ+MXl4nzbPMSdgG++a17NqTV//WZ+yNsb0naAvLwd9ZfU9YZt2K/b3u1+ZM8+979nnat8NguCwxJj5mzZWvuQ6/PEkst9dvISuUUo8s2e/TZLEEIJwysmrMad3EZ5Yfz/WrbsfQ7sG4LrekFTqU47rfsMYsyZJkkuttSdys/RtuiD6xeWyNC6lvMtxnGsB3MxAFEUx+ubNwXnnnY3ly5eiUMyjUa82OykFkiQ4dXTs2c+GweCFQqSjqLSWvtV10JqiadYEA0g7ExjG1JH35/22kF98pe/PeSKdrHxlCtOm4pATTosksZgzL/frcofzpg0bvG8ODY1fqtwYFty7adPYJ3dsr3y0u8e7safH/w8/594llWhM/g2GMAzge3mce/bbcMobVuOxxx/Ew+vuw+DAADTbnY7jftX3vK+C6Chr7cla6+OaIpoLoIuZPQAGIEOEMSHkKBEeUkrexcC9OjFbk0RDKon58/tw7jlvxqJFfejvW5g2yCUaqZNJTjdm6MO7hne8i20iRUswbNNcDE8uIN99ERAJgGMYjlDIL/7OnO6TP6b1aGM2Z7hfCoescABAa4bnye2vf33XO5/f6Hx069axL4EaZcdjGLaFoaHamuFdtTXFbeMbOrv8m0pl5z+dgnxQCDJpb7tBFIVQjoM3n34WTjzxZGzbvgWPP/4odu3aie3btwHg9dbq9UDLqrCylgvWWkVEVpCwIGqQoAQ2bfPxfR9d/Z1YsWI5Dj98Keb0dqGntxv1eh1RpKG17m00Ri6pVXZ80JraG6VM+71Tl9OyMi2r0voxx+ZtsynA2gCO8jZ1dh1/tef23Jq6L4NDJbo4pIUD7P7dht5e9x88r+vuXSO5vxkfGz3bcSKQk5r2WiN8Xa0WfEIp8YliUT3c0eHfRkS3AXhMSjFuOZ0sdV0Hhy1bjqVLl8P1GRs3PAffd7HusXXYsWMbpJRwlNIMjKcz8QbGGCjHQSGfx8KFC7BkyRK4rkRPTxd830ejUQdbgyAIuoJGZVVlbMfvNuq73mp0ME8ISn+gjalpTZoWpukRWy6JwRDNlg+2ESwSeH73dxctfPOfG2N2xnENkHt1AB1UDnnhtNCaUS6pdd1d5XMGB/0P7hgY/aw1lcVSJiAJkLJgWFTryQnVWv2EnTtHP+16ckex6D2WLzj3dnTm7nNc+aR07Fa2bIpuHv19/ViwaD56enthrUapVERHuQwIQhSFCII6KtUKurq64SoHlVoF+VwetXoF2uh54+OjhzdqlZOTpP7mJK6fak3UDxhIkQ63QbYZ+KZ12BOWZaJuJv1sRAJMGlY34LrF+/r7z/w0g38JorYKyV8JXjXCAXZbn+5udU251HXL9gHvM5Vq5UrYmqeUSXugBYMEYGEQad0fjUb9w6P2/O3bCY5DNc+XL/g5d+PwsPOcYLsFgl6oViu7lKSalKIqhWAWhDgKEYYNLwiCIvNwiZj7qrXxxQS7PAhqy62Nl1mT9BBsOhEqAUECgpCWcrJNZ6SbWd+JGhpqBb+tcJhhTAgh1Asdncd8rVTo+8dcbm5Sb2w7qKOm/fGqEk4LYxhKYWDeXP/qJYuK3x4arn9sYGj0cuKa68ik6Q6aV7RsrvlHFoa52AiSo4KgcdTIiIUUwPadg1AyTZMIgUSm4mOAicESZAXYgMAQBBBZCEnNHnoJEpROBTTFkoqj1QiHiceo2TnZckmAhtYhlOMM53J93/D9uf9cLvcNsg1h7aFpZSbzqhQOgGZ+hFHIi0d7uzs+MKfX/7udA7WPj4yPX0am5isVQ7QWL0LzixRAq8leUKuzNP0fwDCWHW7+LcBpGzYAIeREFyqB0jmklrux6WiIWvkXYLdFIbs7fgGlE5YwsCaBUt7O7p4jrymVFn47isa3aB3DWr17KH6I86oVTgtrGVpb5AvikcOX5t+3MM7/1eCuxrtGxsYu16bxOoEIstXDxa0+agCcCsk2e6sJqaBSK2FhiVM9gWF59+rkTBZkm5OONDGZhN2lDk1L06yToWacY00CYsuOl/8v3517XXfP4TeXyj0DcVRHEGoc7LzMgfKqF04LaxkwjHxeru+bm/t8MS++2ghyFzQawfsbUe0ca6OiFKbZLdCKHXhiS4NWTDTjtywIIf3f7juTmPjfpPQdUTo1wBqwCYgtHOU8VSz13eLnyt+Xyn/QJCGIJKxJDuk4ZjpeM8Jpkc4+M0DcKOTkj7s6Sz8eHRNLlSMuChqNsxphbbW1ej5NtMoCgIAgOyGStMCemq6Km6UPacxETWFQayEhwQA3Z7PJpL1kbBpKqXW5fMddUnn/r5DvuMfz8qGxMbRpTRW8uizMnrzmhDMZywxrASGwad6c0reMLnyrWvM6ozhaGSfhKmOiNyRGrwB4PlvT3Vx0L83sEiYskBDNUJctuOWOyEJKAlkYqeSAUu5zUdh4bHBg+JfHnXDKwwBvdBwHcRKm4ymrX7XWZV+8poUzGWPSVhoSNOb5zp25grxTCg/ScaU1em4u7/aPDI8uIvA8P+/1JTqZq3Uyl9l0gTkvYElIGTmu2OkotcVVYpthu4ktP1cqd25LkmRsfHgI2+OBtFArCWGtaYrlJS3lf0hCL3edSsZrk0Nj4iPjVUcmnIy2yIST0RaZcDLaIhNORltkwsloi0w4GW2RCSejLTLhZLRFJpyMtsiEk9EWmXAy2iITTkZbZMLJaItMOBltkQknoy0y4WS0RSacjLbIhJPRFplwMtoiE05GW2TCyWiLTDgZbZEJJ6MtMuFktEUmnIy2yIST0RaZcDLaIhNORltkwsloi0w4GW2RCSejLTLhZLRFJpyMtsiEk9EWmXAy2uL/A4M0ePqcgbeNAAAAAElFTkSuQmCC';

  const DEFAULTS = {
    position: 'bottom-left',
    theme: 'auto',
    language: 'auto',
    iconSize: 'large',
    rememberPreferences: true,
    zIndex: 999999,
    // Voice/TTS subsystem. ElevenLabs is the default provider; it talks to
    // the Help2See FastAPI backend (which proxies ElevenLabs server-side so
    // the API key never reaches the browser). If the backend is unreachable
    // or returns any error, playback gracefully falls back to the free
    // browser voice (Web Speech API) — see ElevenLabsVoiceProvider.speak().
    voice: {
      provider: 'elevenlabs',
      // ⚠️ Troque a URL de produção pelo domínio do seu backend no Railway.
      baseUrl: (window.H2S_API_BASE || (
        /^(localhost|127\.0\.0\.1|)$/.test(location.hostname)
          ? 'http://127.0.0.1:8000'
          : 'https://SEU-BACKEND.up.railway.app'
      ))
    },
    // Telemetria de acessibilidade privacy-first (ATIVA por padrão; requer um
    // siteKey — sem ele nada é enviado). Coleta métricas de uso dos recursos e
    // sinais de fricção/erro para aprimorar o plugin, conforme divulgado nos
    // Termos de Uso do site (termos.html). Envia em lote para POST /api/collect
    // APENAS o siteKey público (nunca o tenant) e NUNCA valores de formulário —
    // no máximo o nome do campo + um código de validade genérico. O endpoint cai
    // por padrão em `${voice.baseUrl}/api/collect` quando deixado como null.
    // Para desativar: Help2See.init({ analytics: { enabled: false } }).
    analytics: {
      enabled: true,
      endpoint: null,
      siteKey: null,
      sampleRate: 1,
      flushIntervalMs: 15000,
      maxBatch: 30,
      wcagAudit: true   // auditoria WCAG silenciosa no carregamento (1x por sessão)
    }
  };

  // ============================================================
  // STATE  (Store)
  // ============================================================
  let config = { ...DEFAULTS };
  let state = {
    panelOpen: false,
    activeFeatures: {},
    activeProfile: null,
    speechUtterance: null,
    speechRate: 0.9,
    voiceRecognition: null,
    textScaleFactor: 1,
    headingsOpen: false,
    theme: 'auto',
    language: 'pt',        // active UI/voice language (set during init via I18N.resolve)
    initialized: false,
    // teardown registries (no leaks)
    docHandlers: {},   // name -> { type, fn, opts }
    observer: null,
    rafIds: {}
  };

  // ============================================================
  // INTERNATIONALIZATION  (i18n)  — PRIORITY 1
  //
  // Single source of truth for every visible string. Nothing user-facing is
  // hardcoded anywhere else: render functions, feedback, notifications, ARIA
  // labels and the screen-reader-style navigation descriptions all resolve
  // through t(). Adding a language is just adding a key block to LOCALES.
  //
  //   pt → Português (Brasil)   en → English   es → Español
  //
  // The active language also drives TTS (ElevenLabs + Web Speech) and the
  // speech-recognition grammar, so switching language re-targets voice too.
  // ============================================================
  const LANG_STORAGE_KEY = 'help2see_lang';   // shared with the site-chrome selector
  const SUPPORTED_LANGS = ['pt', 'en', 'es'];
  const DEFAULT_LANG = 'pt';

  // UI language → BCP-47 tag used by SpeechSynthesis / ElevenLabs / SpeechRecognition.
  const LANG_TTS = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

  // Endonyms — shown identically in every locale's selector.
  const LANG_NAMES = { pt: 'Português', en: 'English', es: 'Español' };

  const LOCALES = {
    pt: {
      // chrome / aria
      'panel.subtitle': 'Acessibilidade para todos',
      'aria.openMenu': 'Abrir menu de acessibilidade (Alt+H)',
      'aria.triggerTitle': 'Configurações de acessibilidade (Alt+H)',
      'aria.panelLabel': 'Painel de acessibilidade Help2See',
      'aria.toggleThemeTitle': 'Alternar tema claro/escuro',
      'aria.toggleThemeLabel': 'Alternar tema de cores',
      'aria.closeTitle': 'Fechar menu de acessibilidade (Esc)',
      'aria.closeLabel': 'Fechar menu de acessibilidade',
      'aria.tablistLabel': 'Categorias de acessibilidade',
      'aria.textSize': 'Tamanho do texto',
      'aria.readingSpeed': 'Velocidade de leitura',
      'aria.langLabel': 'Selecionar idioma',
      'footer.statement': 'Declaração de acessibilidade',
      // tabs
      'tab.visual': 'Visual', 'tab.text': 'Texto', 'tab.nav': 'Nav',
      'tab.reading': 'Leitura', 'tab.profiles': 'Perfis',
      // sections
      'section.contrast': 'Contraste',
      'section.saturation': 'Saturação',
      'section.cursorScreen': 'Cursor e tela',
      'section.size': 'Tamanho',
      'section.spacing': 'Espaçamento',
      'section.style': 'Estilo',
      'section.focusNav': 'Foco e navegação',
      'section.voice': 'Voz',
      'section.pageStructure': 'Estrutura da página',
      'section.readAloud': 'Ler em voz alta',
      'section.readingSpeed': 'Velocidade de leitura',
      'section.profiles': 'Perfis de acessibilidade',
      'section.language': 'Idioma',
      // feature labels (keyed by feature id)
      'feat.high-contrast': 'Alto contraste',
      'feat.dark-contrast': 'Contraste escuro',
      'feat.invert': 'Inverter cores',
      'feat.monochrome': 'Escala de cinza',
      'feat.low-saturation': 'Baixa saturação',
      'feat.high-saturation': 'Alta saturação',
      'feat.hide-images': 'Ocultar imagens',
      'feat.stop-animations': 'Parar animações',
      'feat.big-cursor': 'Cursor maior',
      'feat.reading-mask': 'Máscara de leitura',
      'feat.reading-guide': 'Guia de leitura',
      'feat.magnifier': 'Lupa',
      'feat.text-spacing-light': 'Espaçamento leve',
      'feat.text-spacing-heavy': 'Espaçamento amplo',
      'feat.line-height-light': 'Altura da linha +',
      'feat.line-height-heavy': 'Altura da linha ++',
      'feat.dyslexia-font': 'Fonte para dislexia',
      'feat.text-align-left': 'Alinhar à esquerda',
      'feat.text-align-center': 'Centralizar',
      'feat.text-align-right': 'Alinhar à direita',
      'feat.focus-highlight': 'Destacar foco',
      'feat.highlight-links': 'Destacar links',
      'feat.keyboard-reader': 'Leitor por teclado',
      'feat.hover-reader': 'Leitor ao passar o mouse',
      'feat.voice-nav': 'Navegação por voz',
      // nav tab
      'nav.voiceCommands': 'Comandos de voz:',
      'nav.headingsNav': 'Navegador de títulos',
      'nav.cmdReadPage': 'ler página',
      'nav.cmdStop': 'parar leitura',
      'nav.cmdOpenMenu': 'abrir menu',
      'nav.cmdCloseMenu': 'fechar menu',
      'nav.cmdContrast': 'alto contraste',
      'nav.cmdMagnifier': 'lupa',
      'nav.cmdBigger': 'aumentar fonte',
      'nav.cmdBack': 'voltar',
      // reading tab
      'btn.readPage': 'Ler página inteira',
      'btn.readSelected': 'Ler texto selecionado',
      'btn.pause': 'Pausar', 'btn.resume': 'Continuar', 'btn.stop': 'Parar',
      'label.speed': 'Velocidade',
      // profiles
      'profile.dyslexia': 'Dislexia', 'profile.low-vision': 'Baixa visão',
      'profile.senior': 'Idoso', 'profile.adhd': 'TDAH', 'profile.autism': 'Autismo',
      'profile.cognitive': 'Cognitivo', 'profile.motor': 'Motor',
      'profile.cardTitle': 'Perfil {name}',
      'profile.enableTitle': 'Ativar perfil {name}',
      'profile.featuresEnabled': '{n} recursos ativados',
      'profile.clear': 'Limpar perfil',
      // speech rate
      'rate.slow': 'Lenta', 'rate.slower': 'Mais lenta', 'rate.normal': 'Normal',
      'rate.faster': 'Mais rápida', 'rate.fast': 'Rápida', 'rate.veryFast': 'Muito rápida',
      'rate.max': 'Máxima',
      // voice/TTS feedback
      'fb.premium': 'Voz premium ativa',
      'fb.fallback': 'Voz premium indisponível — usando voz do navegador',
      'fb.credits': 'Créditos de voz premium esgotados — usando voz do navegador',
      'fb.serverOffline': 'Servidor de voz indisponível — usando voz do navegador',
      'fb.invalidKey': 'Chave de API inválida — usando voz do navegador',
      'fb.rateLimit': 'Limite de requisições atingido — usando voz do navegador',
      'fb.offline': 'Sem conexão com a internet — usando voz do navegador',
      'fb.error': 'Voz premium indisponível — usando voz do navegador',
      // notifications
      'notif.voiceUnsupported': 'Navegação por voz não é suportada neste navegador',
      'notif.voiceError': 'Erro na navegação por voz — tente novamente',
      'notif.voiceActive': 'Navegação por voz ativa',
      'notif.invertOn': 'Modo de cores invertidas ativado',
      'notif.invertOff': 'Modo de cores invertidas desativado',
      'notif.langChanged': 'Idioma alterado para {lang}',
      'notif.selectText': 'Selecione um texto primeiro',
      'notif.profileEnabled': 'Perfil {name} ativado',
      'notif.profileRemoved': 'Perfil removido',
      'notif.headingsNone': 'Nenhum título encontrado nesta página',
      'notif.reset': 'Configurações reiniciadas',
      'notif.magnifierHint': 'Lupa ativa: mova o cursor para ampliar',
      // screen-reader-style element descriptions (single-key navigation)
      'desc.heading': 'Título', 'desc.level': 'nível',
      'desc.paragraph': 'Parágrafo', 'desc.emptyParagraph': 'Parágrafo vazio',
      'desc.button': 'Botão', 'desc.unlabeled': 'sem rótulo',
      'desc.disabled': 'desativado', 'desc.pressed': 'pressionado', 'desc.expanded': 'expandido',
      'desc.link': 'Link', 'desc.noText': 'sem texto', 'desc.newTab': 'abre em nova aba',
      'desc.image': 'Imagem', 'desc.imageNoAlt': 'Imagem sem texto alternativo',
      'desc.field': 'Campo', 'desc.type': 'tipo', 'desc.required': 'obrigatório',
      'desc.element': 'elemento',
      'desc.checked': 'marcado', 'desc.unchecked': 'não marcado',
      'desc.noneFound': 'Nenhum {type} encontrado',
      'desc.position': '({n} de {total})',
      // field types
      'field.text': 'texto', 'field.email': 'e-mail', 'field.password': 'senha',
      'field.search': 'busca', 'field.tel': 'telefone', 'field.url': 'endereço web',
      'field.number': 'número', 'field.date': 'data', 'field.time': 'hora',
      'field.checkbox': 'caixa de seleção', 'field.radio': 'opção', 'field.file': 'arquivo',
      'field.range': 'controle deslizante', 'field.color': 'cor',
      'field.textarea': 'área de texto', 'field.select': 'lista de seleção'
    },

    en: {
      'panel.subtitle': 'Accessibility for everyone',
      'aria.openMenu': 'Open accessibility menu (Alt+H)',
      'aria.triggerTitle': 'Accessibility settings (Alt+H)',
      'aria.panelLabel': 'Help2See accessibility panel',
      'aria.toggleThemeTitle': 'Toggle light/dark theme',
      'aria.toggleThemeLabel': 'Toggle color theme',
      'aria.closeTitle': 'Close accessibility menu (Esc)',
      'aria.closeLabel': 'Close accessibility menu',
      'aria.tablistLabel': 'Accessibility categories',
      'aria.textSize': 'Text size',
      'aria.readingSpeed': 'Reading speed',
      'aria.langLabel': 'Select language',
      'footer.statement': 'Accessibility statement',
      'tab.visual': 'Visual', 'tab.text': 'Text', 'tab.nav': 'Nav',
      'tab.reading': 'Reading', 'tab.profiles': 'Profiles',
      'section.contrast': 'Contrast',
      'section.saturation': 'Saturation',
      'section.cursorScreen': 'Cursor & screen',
      'section.size': 'Size',
      'section.spacing': 'Spacing',
      'section.style': 'Style',
      'section.focusNav': 'Focus & navigation',
      'section.voice': 'Voice',
      'section.pageStructure': 'Page structure',
      'section.readAloud': 'Read aloud',
      'section.readingSpeed': 'Reading speed',
      'section.profiles': 'Accessibility profiles',
      'section.language': 'Language',
      'feat.high-contrast': 'High contrast',
      'feat.dark-contrast': 'Dark contrast',
      'feat.invert': 'Invert colors',
      'feat.monochrome': 'Grayscale',
      'feat.low-saturation': 'Low saturation',
      'feat.high-saturation': 'High saturation',
      'feat.hide-images': 'Hide images',
      'feat.stop-animations': 'Stop animations',
      'feat.big-cursor': 'Bigger cursor',
      'feat.reading-mask': 'Reading mask',
      'feat.reading-guide': 'Reading guide',
      'feat.magnifier': 'Magnifier',
      'feat.text-spacing-light': 'Light spacing',
      'feat.text-spacing-heavy': 'Wide spacing',
      'feat.line-height-light': 'Line height +',
      'feat.line-height-heavy': 'Line height ++',
      'feat.dyslexia-font': 'Dyslexia font',
      'feat.text-align-left': 'Align left',
      'feat.text-align-center': 'Center',
      'feat.text-align-right': 'Align right',
      'feat.focus-highlight': 'Highlight focus',
      'feat.highlight-links': 'Highlight links',
      'feat.keyboard-reader': 'Keyboard reader',
      'feat.hover-reader': 'Hover reader',
      'feat.voice-nav': 'Voice navigation',
      'nav.voiceCommands': 'Voice commands:',
      'nav.headingsNav': 'Headings navigator',
      'nav.cmdReadPage': 'read page',
      'nav.cmdStop': 'stop reading',
      'nav.cmdOpenMenu': 'open menu',
      'nav.cmdCloseMenu': 'close menu',
      'nav.cmdContrast': 'high contrast',
      'nav.cmdMagnifier': 'magnifier',
      'nav.cmdBigger': 'increase font',
      'nav.cmdBack': 'go back',
      'btn.readPage': 'Read entire page',
      'btn.readSelected': 'Read selected text',
      'btn.pause': 'Pause', 'btn.resume': 'Resume', 'btn.stop': 'Stop',
      'label.speed': 'Speed',
      'profile.dyslexia': 'Dyslexia', 'profile.low-vision': 'Low vision',
      'profile.senior': 'Senior', 'profile.adhd': 'ADHD', 'profile.autism': 'Autism',
      'profile.cognitive': 'Cognitive', 'profile.motor': 'Motor',
      'profile.cardTitle': '{name} profile',
      'profile.enableTitle': 'Enable {name} profile',
      'profile.featuresEnabled': '{n} features enabled',
      'profile.clear': 'Clear profile',
      'rate.slow': 'Slow', 'rate.slower': 'Slower', 'rate.normal': 'Normal',
      'rate.faster': 'Faster', 'rate.fast': 'Fast', 'rate.veryFast': 'Very fast',
      'rate.max': 'Max',
      'fb.premium': 'Premium voice active',
      'fb.fallback': 'Premium voice unavailable — using browser voice',
      'fb.credits': 'Premium voice credits exhausted — using browser voice',
      'fb.serverOffline': 'Voice server unavailable — using browser voice',
      'fb.invalidKey': 'Invalid API key — using browser voice',
      'fb.rateLimit': 'Request limit reached — using browser voice',
      'fb.offline': 'No internet connection — using browser voice',
      'fb.error': 'Premium voice unavailable — using browser voice',
      'notif.voiceUnsupported': 'Voice navigation is not supported in this browser',
      'notif.voiceError': 'Voice navigation error — please try again',
      'notif.voiceActive': 'Voice navigation active',
      'notif.invertOn': 'Inverted colors mode enabled',
      'notif.invertOff': 'Inverted colors mode disabled',
      'notif.langChanged': 'Language changed to {lang}',
      'notif.selectText': 'Select some text first',
      'notif.profileEnabled': '{name} profile enabled',
      'notif.profileRemoved': 'Profile cleared',
      'notif.headingsNone': 'No headings found on this page',
      'notif.reset': 'Settings reset',
      'notif.magnifierHint': 'Magnifier on: move your pointer to zoom',
      'desc.heading': 'Heading', 'desc.level': 'level',
      'desc.paragraph': 'Paragraph', 'desc.emptyParagraph': 'Empty paragraph',
      'desc.button': 'Button', 'desc.unlabeled': 'no label',
      'desc.disabled': 'disabled', 'desc.pressed': 'pressed', 'desc.expanded': 'expanded',
      'desc.link': 'Link', 'desc.noText': 'no text', 'desc.newTab': 'opens in a new tab',
      'desc.image': 'Image', 'desc.imageNoAlt': 'Image with no alt text',
      'desc.field': 'Field', 'desc.type': 'type', 'desc.required': 'required',
      'desc.element': 'element',
      'desc.checked': 'checked', 'desc.unchecked': 'not checked',
      'desc.noneFound': 'No {type} found',
      'desc.position': '({n} of {total})',
      'field.text': 'text', 'field.email': 'email', 'field.password': 'password',
      'field.search': 'search', 'field.tel': 'phone', 'field.url': 'web address',
      'field.number': 'number', 'field.date': 'date', 'field.time': 'time',
      'field.checkbox': 'checkbox', 'field.radio': 'radio option', 'field.file': 'file',
      'field.range': 'slider', 'field.color': 'color',
      'field.textarea': 'text area', 'field.select': 'select list'
    },

    es: {
      'panel.subtitle': 'Accesibilidad para todos',
      'aria.openMenu': 'Abrir menú de accesibilidad (Alt+H)',
      'aria.triggerTitle': 'Configuración de accesibilidad (Alt+H)',
      'aria.panelLabel': 'Panel de accesibilidad Help2See',
      'aria.toggleThemeTitle': 'Cambiar tema claro/oscuro',
      'aria.toggleThemeLabel': 'Cambiar tema de color',
      'aria.closeTitle': 'Cerrar menú de accesibilidad (Esc)',
      'aria.closeLabel': 'Cerrar menú de accesibilidad',
      'aria.tablistLabel': 'Categorías de accesibilidad',
      'aria.textSize': 'Tamaño del texto',
      'aria.readingSpeed': 'Velocidad de lectura',
      'aria.langLabel': 'Seleccionar idioma',
      'footer.statement': 'Declaración de accesibilidad',
      'tab.visual': 'Visual', 'tab.text': 'Texto', 'tab.nav': 'Nav',
      'tab.reading': 'Lectura', 'tab.profiles': 'Perfiles',
      'section.contrast': 'Contraste',
      'section.saturation': 'Saturación',
      'section.cursorScreen': 'Cursor y pantalla',
      'section.size': 'Tamaño',
      'section.spacing': 'Espaciado',
      'section.style': 'Estilo',
      'section.focusNav': 'Foco y navegación',
      'section.voice': 'Voz',
      'section.pageStructure': 'Estructura de la página',
      'section.readAloud': 'Leer en voz alta',
      'section.readingSpeed': 'Velocidad de lectura',
      'section.profiles': 'Perfiles de accesibilidad',
      'section.language': 'Idioma',
      'feat.high-contrast': 'Alto contraste',
      'feat.dark-contrast': 'Contraste oscuro',
      'feat.invert': 'Invertir colores',
      'feat.monochrome': 'Escala de grises',
      'feat.low-saturation': 'Baja saturación',
      'feat.high-saturation': 'Alta saturación',
      'feat.hide-images': 'Ocultar imágenes',
      'feat.stop-animations': 'Detener animaciones',
      'feat.big-cursor': 'Cursor más grande',
      'feat.reading-mask': 'Máscara de lectura',
      'feat.reading-guide': 'Guía de lectura',
      'feat.magnifier': 'Lupa',
      'feat.text-spacing-light': 'Espaciado ligero',
      'feat.text-spacing-heavy': 'Espaciado amplio',
      'feat.line-height-light': 'Altura de línea +',
      'feat.line-height-heavy': 'Altura de línea ++',
      'feat.dyslexia-font': 'Fuente para dislexia',
      'feat.text-align-left': 'Alinear a la izquierda',
      'feat.text-align-center': 'Centrar',
      'feat.text-align-right': 'Alinear a la derecha',
      'feat.focus-highlight': 'Resaltar foco',
      'feat.highlight-links': 'Resaltar enlaces',
      'feat.keyboard-reader': 'Lector por teclado',
      'feat.hover-reader': 'Lector al pasar el ratón',
      'feat.voice-nav': 'Navegación por voz',
      'nav.voiceCommands': 'Comandos de voz:',
      'nav.headingsNav': 'Navegador de encabezados',
      'nav.cmdReadPage': 'leer página',
      'nav.cmdStop': 'detener lectura',
      'nav.cmdOpenMenu': 'abrir menú',
      'nav.cmdCloseMenu': 'cerrar menú',
      'nav.cmdContrast': 'alto contraste',
      'nav.cmdMagnifier': 'lupa',
      'nav.cmdBigger': 'aumentar fuente',
      'nav.cmdBack': 'volver',
      'btn.readPage': 'Leer la página entera',
      'btn.readSelected': 'Leer texto seleccionado',
      'btn.pause': 'Pausar', 'btn.resume': 'Reanudar', 'btn.stop': 'Detener',
      'label.speed': 'Velocidad',
      'profile.dyslexia': 'Dislexia', 'profile.low-vision': 'Baja visión',
      'profile.senior': 'Mayor', 'profile.adhd': 'TDAH', 'profile.autism': 'Autismo',
      'profile.cognitive': 'Cognitivo', 'profile.motor': 'Motor',
      'profile.cardTitle': 'Perfil {name}',
      'profile.enableTitle': 'Activar perfil {name}',
      'profile.featuresEnabled': '{n} funciones activadas',
      'profile.clear': 'Limpiar perfil',
      'rate.slow': 'Lenta', 'rate.slower': 'Más lenta', 'rate.normal': 'Normal',
      'rate.faster': 'Más rápida', 'rate.fast': 'Rápida', 'rate.veryFast': 'Muy rápida',
      'rate.max': 'Máxima',
      'fb.premium': 'Voz premium activa',
      'fb.fallback': 'Voz premium no disponible — usando voz del navegador',
      'fb.credits': 'Créditos de voz premium agotados — usando voz del navegador',
      'fb.serverOffline': 'Servidor de voz no disponible — usando voz del navegador',
      'fb.invalidKey': 'Clave de API no válida — usando voz del navegador',
      'fb.rateLimit': 'Límite de solicitudes alcanzado — usando voz del navegador',
      'fb.offline': 'Sin conexión a internet — usando voz del navegador',
      'fb.error': 'Voz premium no disponible — usando voz del navegador',
      'notif.voiceUnsupported': 'La navegación por voz no es compatible con este navegador',
      'notif.voiceError': 'Error en la navegación por voz — inténtalo de nuevo',
      'notif.voiceActive': 'Navegación por voz activa',
      'notif.invertOn': 'Modo de colores invertidos activado',
      'notif.invertOff': 'Modo de colores invertidos desactivado',
      'notif.langChanged': 'Idioma cambiado a {lang}',
      'notif.selectText': 'Selecciona un texto primero',
      'notif.profileEnabled': 'Perfil {name} activado',
      'notif.profileRemoved': 'Perfil eliminado',
      'notif.headingsNone': 'No se encontraron encabezados en esta página',
      'notif.reset': 'Configuración restablecida',
      'notif.magnifierHint': 'Lupa activa: mueve el cursor para ampliar',
      'desc.heading': 'Encabezado', 'desc.level': 'nivel',
      'desc.paragraph': 'Párrafo', 'desc.emptyParagraph': 'Párrafo vacío',
      'desc.button': 'Botón', 'desc.unlabeled': 'sin etiqueta',
      'desc.disabled': 'desactivado', 'desc.pressed': 'presionado', 'desc.expanded': 'expandido',
      'desc.link': 'Enlace', 'desc.noText': 'sin texto', 'desc.newTab': 'abre en una pestaña nueva',
      'desc.image': 'Imagen', 'desc.imageNoAlt': 'Imagen sin texto alternativo',
      'desc.field': 'Campo', 'desc.type': 'tipo', 'desc.required': 'obligatorio',
      'desc.element': 'elemento',
      'desc.checked': 'marcado', 'desc.unchecked': 'no marcado',
      'desc.noneFound': 'Ningún {type} encontrado',
      'desc.position': '({n} de {total})',
      'field.text': 'texto', 'field.email': 'correo', 'field.password': 'contraseña',
      'field.search': 'búsqueda', 'field.tel': 'teléfono', 'field.url': 'dirección web',
      'field.number': 'número', 'field.date': 'fecha', 'field.time': 'hora',
      'field.checkbox': 'casilla de verificación', 'field.radio': 'opción', 'field.file': 'archivo',
      'field.range': 'control deslizante', 'field.color': 'color',
      'field.textarea': 'área de texto', 'field.select': 'lista desplegable'
    }
  };

  // Resolve the active language: explicit config > saved preference > browser
  // language > pt fallback. Accepts 'pt-BR', 'en-US', etc. (only the primary
  // subtag matters).
  function normalizeLang(raw) {
    if (!raw) return null;
    const base = String(raw).toLowerCase().split('-')[0];
    return SUPPORTED_LANGS.indexOf(base) !== -1 ? base : null;
  }

  function detectBrowserLang() {
    const langs = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || navigator.userLanguage];
    for (let i = 0; i < langs.length; i++) {
      const n = normalizeLang(langs[i]);
      if (n) return n;
    }
    return null;
  }

  function loadSavedLang() {
    try { return normalizeLang(localStorage.getItem(LANG_STORAGE_KEY)); }
    catch (e) { return null; }
  }

  function saveLang(lang) {
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (e) {}
  }

  // Pick the initial language during init(). Precedence is documented above.
  function resolveInitialLang() {
    const explicit = (config.language && config.language !== 'auto')
      ? normalizeLang(config.language) : null;
    return explicit || loadSavedLang() || detectBrowserLang() || DEFAULT_LANG;
  }

  // Translate a key, interpolating {placeholders}. Falls back to pt, then to
  // the raw key, so a missing translation degrades gracefully (never blank).
  function t(key, vars) {
    const lang = state.language || DEFAULT_LANG;
    let s = (LOCALES[lang] && LOCALES[lang][key]);
    if (s == null) s = (LOCALES[DEFAULT_LANG] && LOCALES[DEFAULT_LANG][key]);
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }

  // BCP-47 tag for the active language, used by every voice subsystem.
  function ttsLang() { return LANG_TTS[state.language] || LANG_TTS[DEFAULT_LANG]; }

  // Live language switch — no reload. Updates state, persistence, the panel
  // (via the existing re-render path, so delegated listeners survive), the
  // floating trigger's ARIA, and any active speech recognition. TTS providers
  // read ttsLang() per call, so the next read speaks in the new language with
  // no re-registration. Broadcasts 'help2see:languagechange' so the site
  // chrome (and other tabs) can follow. `opts.silent` suppresses the broadcast
  // when the change ORIGINATED from that same event (prevents feedback loops).
  function setLanguage(lang, opts) {
    const norm = normalizeLang(lang);
    if (!norm || norm === state.language) return;
    state.language = norm;
    saveLang(norm);

    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      const activeTab = panel.querySelector('.h2s-tab-active');
      panel.innerHTML = buildPanelHTML(activeTab ? activeTab.dataset.tab : 'visual');
    }
    const trigger = document.getElementById(TRIGGER_ID);
    if (trigger) {
      trigger.setAttribute('aria-label', t('aria.openMenu'));
      trigger.title = t('aria.triggerTitle');
    }
    if (state.voiceRecognition) {
      try { state.voiceRecognition.lang = ttsLang(); } catch (_) {}
    }
    announce(t('notif.langChanged', { lang: LANG_NAMES[norm] || norm }));

    if (!(opts && opts.silent)) {
      try {
        document.dispatchEvent(new CustomEvent('help2see:languagechange', {
          detail: { lang: norm, source: 'plugin' }
        }));
      } catch (_) {}
    }
  }

  // Adopt a language change broadcast by the site chrome. Ignore our own echo
  // (source === 'plugin') and switch silently so we don't re-broadcast.
  function onExternalLangChange(e) {
    if (e && e.detail && e.detail.source === 'plugin') return;
    setLanguage(e && e.detail && e.detail.lang, { silent: true });
  }
  // Cross-tab sync: another tab wrote the shared help2see_lang key.
  function onLangStorage(e) {
    if (!e || e.key !== LANG_STORAGE_KEY) return;
    setLanguage(e.newValue, { silent: true });
  }

  // ============================================================
  // UTILITIES  (Utils)
  // ============================================================
  function injectStyle(id, css) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = css;
    return el;
  }

  function removeStyle(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // Track document-level listeners centrally so they can always be torn down.
  function addDocListener(name, type, fn, opts) {
    removeDocListener(name);
    document.addEventListener(type, fn, opts);
    state.docHandlers[name] = { type, fn, opts };
  }
  function removeDocListener(name) {
    const h = state.docHandlers[name];
    if (h) {
      document.removeEventListener(h.type, h.fn, h.opts);
      delete state.docHandlers[name];
    }
  }

  // requestAnimationFrame-throttled callback (coalesces rapid events into one paint).
  function rafThrottle(key, fn) {
    return function (...args) {
      if (state.rafIds[key]) return;
      state.rafIds[key] = requestAnimationFrame(() => {
        state.rafIds[key] = 0;
        fn(...args);
      });
    };
  }
  function cancelRaf(key) {
    if (state.rafIds[key]) {
      cancelAnimationFrame(state.rafIds[key]);
      state.rafIds[key] = 0;
    }
  }

  function pointerY(e) {
    return e.clientY != null ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
  }

  function savePrefs() {
    if (!config.rememberPreferences) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        activeFeatures: state.activeFeatures,
        activeProfile: state.activeProfile,
        textScaleFactor: state.textScaleFactor
      }));
    } catch (e) {}
  }

  function loadPrefs() {
    if (!config.rememberPreferences) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs.activeFeatures) state.activeFeatures = prefs.activeFeatures;
      if (prefs.activeProfile) state.activeProfile = prefs.activeProfile;
      if (prefs.textScaleFactor) state.textScaleFactor = prefs.textScaleFactor;
    } catch (e) {}
  }

  function isFeatureActive(id) {
    return !!state.activeFeatures[id];
  }

  function setFeatureActive(id, active) {
    if (active) {
      state.activeFeatures[id] = true;
    } else {
      delete state.activeFeatures[id];
    }
    savePrefs();
    updateButtonState(id, active);
    // Telemetria: este é o único ponto de passagem dos toggles reais do usuário
    // (painel, teclado, voz). restore/reset/destroy chamam applyFeature direto,
    // então não geram eventos espúrios aqui. Sem efeito se o analytics estiver off.
    if (Analytics.isActive()) Analytics.track('a11y_toggle', { feature: id, active: !!active });
  }

  function updateButtonState(id, active) {
    const btn = document.querySelector(`[data-feature="${id}"]`);
    if (!btn) return;
    btn.classList.toggle('h2s-active', active);
    btn.setAttribute('aria-pressed', String(active));
  }

  // ============================================================
  // CSS INJECTION  (Styles)  — visual identity preserved verbatim;
  // only the trigger size and the magnifier lens are upgraded.
  // ============================================================
  function injectBaseStyles() {
    const triggerSize = config.iconSize === 'large' ? 80 : 64;
    const triggerIcon = config.iconSize === 'large' ? 40 : 32;
    const css = `
      /* ── Help2See Base Variables ── */
      :root {
        --h2s-primary: #4A4793;
        --h2s-primary-dark: #363463;
        --h2s-primary-light: #6E6BC0;
        --h2s-accent: #D3DC2A;          /* highlight/active accent — use sparingly */
        --h2s-accent-contrast: #1C1B28; /* dark text to sit on the accent */
        --h2s-white: #ffffff;
        --h2s-bg: #F8F8FA;
        --h2s-surface: #EFEEF7;
        --h2s-border: #DCDAEC;
        --h2s-text: #1C1B28;
        --h2s-text-muted: #5C5A72;
        --h2s-shadow: 0 8px 40px rgba(74,71,147,0.18);
        --h2s-radius: 18px;
        --h2s-radius-sm: 10px;
        --h2s-panel-w: 340px;
        --h2s-z: ${config.zIndex};
        --h2s-transition: 0.2s cubic-bezier(0.4,0,0.2,1);
      }

      [data-h2s-theme="dark"] {
        --h2s-bg: #1C1B28;
        --h2s-surface: #272636;
        --h2s-border: #3A3852;
        --h2s-text: #F2F1F8;
        --h2s-text-muted: #A6A3C0;
        --h2s-shadow: 0 8px 40px rgba(0,0,0,0.5);
      }

      /* ── Trigger Button (enlarged for low-vision users) ── */
      #h2s-trigger {
        position: fixed;
        width: ${triggerSize}px;
        height: ${triggerSize}px;
        border-radius: 50%;
        background: var(--h2s-primary);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(74,71,147,0.4), 0 0 0 0 rgba(74,71,147,0.4);
        z-index: var(--h2s-z);
        transition: transform var(--h2s-transition), box-shadow var(--h2s-transition);
        touch-action: none;
        animation: h2s-pulse 3s ease-in-out infinite;
        outline: none;
        padding: 0;
      }
      #h2s-trigger:hover, #h2s-trigger:focus-visible {
        transform: scale(1.1);
        box-shadow: 0 6px 30px rgba(74,71,147,0.55), 0 0 0 6px rgba(74,71,147,0.15);
        animation: none;
      }
      #h2s-trigger:focus-visible { box-shadow: 0 6px 30px rgba(74,71,147,0.55), 0 0 0 4px var(--h2s-white), 0 0 0 8px var(--h2s-primary); }
      #h2s-trigger:active { transform: scale(0.96); }
      #h2s-trigger svg { width: ${triggerIcon}px; height: ${triggerIcon}px; color: white; }
      /* Branding: real Help2See logo asset inside the trigger. The mark has a
         transparent background and sits on a white disc so it stays legible on
         the colored button without altering the button's own visual identity. */
      #h2s-trigger .h2s-trigger-logo {
        width: ${triggerIcon + 8}px; height: ${triggerIcon + 8}px;
        object-fit: contain; display: block; border-radius: 50%;
        background: #fff; padding: 4px; box-sizing: border-box;
      }

      #h2s-trigger.h2s-pos-br { bottom: 24px; right: 24px; }
      #h2s-trigger.h2s-pos-bl { bottom: 24px; left: 24px; }
      #h2s-trigger.h2s-pos-tr { top: 24px; right: 24px; }
      #h2s-trigger.h2s-pos-tl { top: 24px; left: 24px; }

      @keyframes h2s-pulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(74,71,147,0.4), 0 0 0 0 rgba(74,71,147,0.3); }
        50% { box-shadow: 0 4px 20px rgba(74,71,147,0.4), 0 0 0 10px rgba(74,71,147,0); }
      }
      @media (prefers-reduced-motion: reduce) {
        #h2s-trigger { animation: none; }
      }

      /* ── Panel ── */
      #h2s-panel {
        position: fixed;
        width: var(--h2s-panel-w);
        max-height: 88vh;
        background: var(--h2s-bg);
        border-radius: var(--h2s-radius);
        box-shadow: var(--h2s-shadow);
        z-index: calc(var(--h2s-z) + 1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        opacity: 0;
        transform: translateY(12px) scale(0.97);
        pointer-events: none;
        transition: opacity var(--h2s-transition), transform var(--h2s-transition);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        color: var(--h2s-text);
        border: 1px solid var(--h2s-border);
      }
      #h2s-panel.h2s-panel-open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: all;
      }
      #h2s-panel.h2s-pos-br { bottom: 96px; right: 24px; }
      #h2s-panel.h2s-pos-bl { bottom: 96px; left: 24px; }
      #h2s-panel.h2s-pos-tr { top: 96px; right: 24px; }
      #h2s-panel.h2s-pos-tl { top: 96px; left: 24px; }

      /* ── Panel Header ── */
      .h2s-header {
        background: var(--h2s-primary);
        border-bottom: 3px solid var(--h2s-accent);
        padding: 16px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .h2s-header-left { display: flex; align-items: center; gap: 10px; }
      .h2s-logo {
        width: 32px; height: 32px;
        background: rgba(255,255,255,0.2);
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
      }
      .h2s-logo svg { width: 20px; height: 20px; color: white; }
      .h2s-logo .h2s-logo-img {
        width: 24px; height: 24px; object-fit: contain; display: block;
        border-radius: 50%; background: #fff; padding: 2px; box-sizing: border-box;
      }
      .h2s-title { color: white; font-weight: 700; font-size: 16px; letter-spacing: -0.3px; }
      .h2s-subtitle { color: rgba(255,255,255,0.75); font-size: 11px; margin-top: 1px; }
      .h2s-header-actions { display: flex; gap: 6px; align-items: center; }
      .h2s-header-btn {
        width: 32px; height: 32px; border-radius: 8px; border: none;
        background: rgba(255,255,255,0.15); color: white; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background var(--h2s-transition); flex-shrink: 0;
      }
      .h2s-header-btn:hover { background: rgba(255,255,255,0.25); }
      .h2s-header-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
      .h2s-header-btn svg { width: 16px; height: 16px; }

      /* ── Tabs ── */
      .h2s-tabs {
        display: flex; background: var(--h2s-surface); padding: 6px; gap: 2px;
        border-bottom: 1px solid var(--h2s-border); flex-shrink: 0;
        overflow-x: auto; scrollbar-width: none;
      }
      .h2s-tabs::-webkit-scrollbar { display: none; }
      .h2s-tab {
        flex: 1; min-width: fit-content; padding: 6px 10px; border-radius: 6px;
        border: none; background: transparent; color: var(--h2s-text-muted);
        font-size: 11px; font-weight: 600; cursor: pointer;
        transition: all var(--h2s-transition); white-space: nowrap;
        text-transform: uppercase; letter-spacing: 0.4px;
      }
      .h2s-tab.h2s-tab-active {
        background: var(--h2s-primary); color: white;
        box-shadow: 0 2px 8px rgba(74,71,147,0.3), inset 0 -3px 0 var(--h2s-accent);
      }
      .h2s-tab:hover:not(.h2s-tab-active) { background: var(--h2s-bg); color: var(--h2s-text); }
      .h2s-tab:focus-visible { outline: 2px solid var(--h2s-primary); outline-offset: 2px; }

      /* ── Panel Body ── */
      .h2s-body {
        overflow-y: auto; flex: 1; padding: 14px;
        scrollbar-width: thin; scrollbar-color: var(--h2s-border) transparent;
      }
      .h2s-body::-webkit-scrollbar { width: 4px; }
      .h2s-body::-webkit-scrollbar-thumb { background: var(--h2s-border); border-radius: 4px; }

      /* ── Section ── */
      .h2s-section-title {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.8px; color: var(--h2s-text-muted); margin: 12px 0 8px;
      }
      .h2s-section-title:first-child { margin-top: 0; }

      /* ── Grid ── */
      .h2s-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .h2s-grid-3 { grid-template-columns: 1fr 1fr 1fr; }

      /* ── Feature Button ── */
      .h2s-btn {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 7px; padding: 14px 8px; border-radius: var(--h2s-radius-sm);
        border: 1.5px solid var(--h2s-border); background: var(--h2s-surface);
        color: var(--h2s-text); cursor: pointer; transition: all var(--h2s-transition);
        font-size: 11.5px; font-weight: 600; text-align: center; line-height: 1.3;
        min-height: 80px; position: relative; overflow: hidden; user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .h2s-btn::before {
        content: ''; position: absolute; inset: 0; background: var(--h2s-primary);
        opacity: 0; transition: opacity var(--h2s-transition);
      }
      .h2s-btn:hover { border-color: var(--h2s-primary); transform: translateY(-1px); }
      .h2s-btn:hover::before { opacity: 0.05; }
      .h2s-btn:active { transform: scale(0.97); }
      .h2s-btn:focus-visible { outline: 2px solid var(--h2s-primary); outline-offset: 2px; }
      .h2s-btn.h2s-active {
        background: var(--h2s-primary); border-color: var(--h2s-primary); color: white;
        box-shadow: 0 4px 16px rgba(74,71,147,0.35), inset 0 3px 0 var(--h2s-accent);
      }
      .h2s-btn.h2s-active::before { opacity: 0; }
      .h2s-btn .h2s-btn-icon {
        width: 28px; height: 28px; position: relative; z-index: 1;
        display: flex; align-items: center; justify-content: center;
      }
      .h2s-btn .h2s-btn-icon svg { width: 24px; height: 24px; }
      .h2s-btn .h2s-btn-label { position: relative; z-index: 1; }

      /* ── Full Width Button ── */
      .h2s-btn-full {
        display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 14px;
        border-radius: var(--h2s-radius-sm); border: 1.5px solid var(--h2s-border);
        background: var(--h2s-surface); color: var(--h2s-text); cursor: pointer;
        font-size: 13px; font-weight: 600; text-align: left;
        transition: all var(--h2s-transition); margin-bottom: 6px;
      }
      .h2s-btn-full:hover { border-color: var(--h2s-primary); }
      .h2s-btn-full:focus-visible { outline: 2px solid var(--h2s-primary); outline-offset: 2px; }
      .h2s-btn-full.h2s-active { background: var(--h2s-primary); border-color: var(--h2s-primary); color: white; }
      .h2s-btn-full svg { width: 18px; height: 18px; flex-shrink: 0; }

      /* ── Profile Buttons ── */
      .h2s-profile-btn {
        display: flex; align-items: center; gap: 10px; padding: 12px 14px;
        border-radius: var(--h2s-radius-sm); border: 1.5px solid var(--h2s-border);
        background: var(--h2s-surface); color: var(--h2s-text); cursor: pointer;
        font-size: 12.5px; font-weight: 600; transition: all var(--h2s-transition);
        width: 100%; margin-bottom: 6px;
      }
      .h2s-profile-btn:hover { border-color: var(--h2s-primary); }
      .h2s-profile-btn:focus-visible { outline: 2px solid var(--h2s-primary); outline-offset: 2px; }
      .h2s-profile-btn.h2s-active { background: var(--h2s-primary); border-color: var(--h2s-primary); color: white; }
      .h2s-profile-icon {
        width: 32px; height: 32px; border-radius: 8px; background: rgba(74,71,147,0.1);
        display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 16px;
      }
      .h2s-profile-btn.h2s-active .h2s-profile-icon { background: rgba(255,255,255,0.2); }

      /* ── Slider ── */
      .h2s-slider-wrap {
        display: flex; flex-direction: column; gap: 6px; padding: 10px 14px;
        background: var(--h2s-surface); border-radius: var(--h2s-radius-sm);
        border: 1.5px solid var(--h2s-border); margin-bottom: 8px;
      }
      .h2s-slider-label {
        display: flex; justify-content: space-between; font-size: 12px;
        font-weight: 600; color: var(--h2s-text);
      }
      .h2s-slider {
        -webkit-appearance: none; appearance: none; width: 100%; height: 4px;
        border-radius: 2px; background: var(--h2s-border); outline: none;
      }
      .h2s-slider:focus-visible { outline: 2px solid var(--h2s-primary); outline-offset: 4px; }
      .h2s-slider::-webkit-slider-thumb {
        -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
        background: var(--h2s-primary); cursor: pointer; box-shadow: 0 2px 6px rgba(74,71,147,0.4);
      }
      .h2s-slider::-moz-range-thumb {
        width: 16px; height: 16px; border: none; border-radius: 50%;
        background: var(--h2s-primary); cursor: pointer;
      }

      /* ── Footer ── */
      .h2s-footer {
        padding: 10px 14px; border-top: 1px solid var(--h2s-border);
        display: flex; align-items: center; justify-content: space-between;
        flex-shrink: 0; background: var(--h2s-bg); gap: 8px; flex-wrap: wrap;
      }
      .h2s-footer a, .h2s-footer button.h2s-link {
        color: var(--h2s-primary); font-size: 11px; text-decoration: none;
        font-weight: 600; background: none; border: none; cursor: pointer; padding: 0;
      }
      .h2s-footer a:hover, .h2s-footer button.h2s-link:hover { text-decoration: underline; }
      .h2s-brand {
        font-size: 11px; font-weight: 700; color: var(--h2s-text-muted);
        display: flex; align-items: center; gap: 4px;
      }
      .h2s-brand span { color: var(--h2s-primary); }
      /* ── Language selector (footer) ── */
      .h2s-lang { display: flex; align-items: center; gap: 5px; }
      .h2s-lang-icon { display: inline-flex; color: var(--h2s-text-muted); }
      .h2s-lang-icon svg { width: 15px; height: 15px; }
      .h2s-lang-select {
        font-family: inherit; font-size: 11px; font-weight: 600;
        color: var(--h2s-text); background: var(--h2s-surface);
        border: 1px solid var(--h2s-border); border-radius: 7px;
        padding: 4px 7px; cursor: pointer; line-height: 1.2;
        transition: border-color var(--h2s-transition), box-shadow var(--h2s-transition);
      }
      .h2s-lang-select:hover { border-color: var(--h2s-primary); }
      .h2s-lang-select:focus-visible {
        outline: 2px solid var(--h2s-primary); outline-offset: 1px; border-color: var(--h2s-primary);
      }

      /* ── Reset Button ── */
      .h2s-reset-btn {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        width: 100%; padding: 10px; border-radius: 8px; border: 1.5px solid var(--h2s-border);
        background: transparent; color: var(--h2s-text-muted); cursor: pointer;
        font-size: 12px; font-weight: 600; margin-top: 8px; transition: all var(--h2s-transition);
      }
      .h2s-reset-btn:hover { border-color: #e53e3e; color: #e53e3e; }
      .h2s-reset-btn:focus-visible { outline: 2px solid var(--h2s-primary); outline-offset: 2px; }

      /* ── Heading nav items ── */
      .h2s-heading-item {
        display: block; width: 100%; text-align: left; border: none; background: none;
        cursor: pointer; font-size: 11.5px; color: var(--h2s-text); border-radius: 4px;
        transition: background 0.15s; padding: 5px 8px;
      }
      .h2s-heading-item:hover { background: var(--h2s-surface); }
      .h2s-heading-item:focus-visible { outline: 2px solid var(--h2s-primary); outline-offset: -2px; }
      .h2s-heading-item strong { opacity: 0.5; font-size: 10px; }

      /* ── Reading Mask ── */
      .h2s-mask-top {
        position: fixed; top: 0; left: 0; width: 100%; background: rgba(0,0,0,0.6);
        pointer-events: none; border-bottom: 3px solid var(--h2s-primary);
        z-index: calc(var(--h2s-z) - 1);
      }
      .h2s-mask-bottom {
        position: fixed; bottom: 0; left: 0; width: 100%; background: rgba(0,0,0,0.6);
        pointer-events: none; border-top: 3px solid var(--h2s-primary);
        z-index: calc(var(--h2s-z) - 1);
      }

      /* ── Reading Guide ── */
      .h2s-reading-guide {
        position: fixed; left: 0; width: 100%; height: 2px; background: var(--h2s-primary);
        pointer-events: none; z-index: calc(var(--h2s-z) - 1); opacity: 0.8;
        box-shadow: 0 0 8px rgba(74,71,147,0.6);
      }

      /* ── Accessibility Effect Classes ── */
      .h2s-high-contrast *, .h2s-high-contrast {
        background: #fff !important; color: #000 !important; border-color: #000 !important;
      }
      .h2s-dark-contrast *, .h2s-dark-contrast {
        background: #000 !important; color: #fff !important; border-color: #fff !important;
      }
      .h2s-dark-contrast a { color: #D3DC2A !important; }
      .h2s-inverted { filter: invert(1) hue-rotate(180deg); }
      .h2s-inverted img, .h2s-inverted video { filter: invert(1) hue-rotate(180deg); }
      .h2s-monochrome { filter: grayscale(1); }
      .h2s-low-saturation { filter: saturate(0.3); }
      .h2s-high-saturation { filter: saturate(2.5); }

      /* keep the widget itself readable under whole-page filters */
      #h2s-panel, #h2s-trigger, #h2s-magnifier-lens { filter: none !important; }

      /* ── Dyslexia Font ── */
      @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;700&display=swap');
      .h2s-dyslexia-font *:not(#h2s-panel):not(#h2s-panel *) {
        font-family: 'Lexend', 'Arial', sans-serif !important;
        letter-spacing: 0.05em !important; word-spacing: 0.15em !important;
      }

      /* ── Text Spacing ── */
      .h2s-text-spacing-light *:not(#h2s-panel, #h2s-panel *) {
        letter-spacing: 0.08em !important; word-spacing: 0.12em !important;
      }
      .h2s-text-spacing-heavy *:not(#h2s-panel, #h2s-panel *) {
        letter-spacing: 0.16em !important; word-spacing: 0.25em !important;
      }

      /* ── Line Height ── */
      .h2s-line-height-light *:not(#h2s-panel, #h2s-panel *) { line-height: 1.8 !important; }
      .h2s-line-height-heavy *:not(#h2s-panel, #h2s-panel *) { line-height: 2.4 !important; }

      /* ── Highlight Links ── */
      .h2s-highlight-links a:not(#h2s-panel a) {
        outline: 2px solid var(--h2s-primary) !important; outline-offset: 2px !important;
        background: rgba(74,71,147,0.08) !important; border-radius: 2px !important;
      }

      /* ── Bigger Cursor ── */
      .h2s-big-cursor, .h2s-big-cursor * {
        cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='40' viewBox='0 0 32 40'%3E%3Cpath d='M0 0l8 28 5-6 5 14 4-2-5-14 7 1z' fill='%234A4793' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") 0 0, auto !important;
      }

      /* ── Focus Highlight ── */
      .h2s-focus-highlight *:focus {
        outline: 3px solid var(--h2s-primary) !important; outline-offset: 3px !important;
        box-shadow: 0 0 0 6px rgba(74,71,147,0.2) !important;
      }

      /* ── Hide Images ── */
      .h2s-hide-images img:not(#h2s-panel img) { visibility: hidden !important; }

      /* ── Stop Animations ── */
      .h2s-stop-animations *, .h2s-stop-animations *::before, .h2s-stop-animations *::after {
        animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }

      /* ── Text Align ── */
      .h2s-text-left *:not(#h2s-panel, #h2s-panel *) { text-align: left !important; }
      .h2s-text-center *:not(#h2s-panel, #h2s-panel *) { text-align: center !important; }
      .h2s-text-right *:not(#h2s-panel, #h2s-panel *) { text-align: right !important; }

      /* ── Voice Active Indicator ── */
      .h2s-voice-active-dot {
        position: fixed; bottom: 96px; right: 96px; width: 12px; height: 12px;
        border-radius: 50%; background: #e53e3e; z-index: var(--h2s-z);
        animation: h2s-mic-pulse 1s ease-in-out infinite; pointer-events: none;
      }
      @keyframes h2s-mic-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.4); opacity: 0.7; }
      }

      /* ── Magnifier (functional clone-based lens) ── */
      #h2s-magnifier-lens.h2s-magnifier {
        position: fixed; width: 200px; height: 200px; border-radius: 50%;
        border: 3px solid var(--h2s-primary); overflow: hidden; pointer-events: none;
        z-index: calc(var(--h2s-z) + 2); box-shadow: 0 6px 28px rgba(0,0,0,0.35);
        background: var(--h2s-bg); display: none; transform: translate(-50%, -50%);
      }
      .h2s-magnifier-inner {
        position: absolute; inset: 0; transform-origin: 0 0; will-change: transform;
        background: #fff;
      }

      /* ── Responsive ── */
      @media (max-width: 400px) {
        #h2s-panel { width: 100vw; border-radius: 18px 18px 0 0; }
        #h2s-panel.h2s-pos-br, #h2s-panel.h2s-pos-bl { bottom: 0; right: 0; left: 0; }
      }

      /* ── Notification ── */
      .h2s-notification {
        position: fixed; bottom: 100px; right: 24px; background: var(--h2s-primary);
        color: white; padding: 10px 16px; border-radius: 10px; font-size: 13px;
        font-weight: 600; z-index: var(--h2s-z); opacity: 0; transform: translateY(8px);
        transition: all 0.25s ease; pointer-events: none; max-width: 260px;
        box-shadow: 0 4px 16px rgba(74,71,147,0.4);
      }
      .h2s-notification.h2s-show { opacity: 1; transform: translateY(0); }

      /* ── Visually hidden live region ── */
      .h2s-sr-only {
        position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
      }

      #h2s-panel:focus { outline: none; }
    `;
    injectStyle('h2s-base-styles', css);
  }
  

  // ============================================================
  // ICONS
  // ============================================================
  const ICONS = {
    accessibility: `<path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 9l-2 8h2l1-3 2 1v5h2v-6l-2-1.5L10.5 11H14l1.5 2L14 17h2l.5-2 2-6h-2l-.5 2H9.5L9 9H7z"/>`,
    close: `<path d="M18 6 6 18M6 6l12 12"/>`,
    reset: `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>`,
    theme: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>`,
    contrast: `<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 2v20" fill="none"/>`,
    text: `<path d="M4 7V4h16v3M9 20h6M12 4v16"/>`,
    eye: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`,
    voice: `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>`,
    keyboard: `<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8M6 14h.01M18 14h.01"/>`,
    profile: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    cursor: `<path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/>`,
    image: `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>`,
    animation: `<circle cx="12" cy="12" r="10"/><path d="M10 15V9l5 3z"/>`,
    mask: `<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 9h20M2 15h20"/>`,
    guide: `<path d="M3 12h18M12 5l-3 7 3 7 3-7z"/>`,
    magnify: `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>`,
    link: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
    read: `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`,
    stop: `<rect x="3" y="3" width="18" height="18" rx="2"/>`,
    play: `<polygon points="5 3 19 12 5 21 5 3"/>`,
    pause: `<line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/>`,
    chevron: `<polyline points="6 9 12 15 18 9"/>`,
    info: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`,
    globe: `<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`,
  };

  function icon(key, size = 20) {
    const paths = ICONS[key] || ICONS.accessibility;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  // ============================================================
  // FEATURE REGISTRY  (Features) — single source of truth.
  // class: CSS class toggled on <html>; group: mutually-exclusive set.
  // ============================================================
  const FEATURES = {
    'high-contrast':      { class: 'h2s-high-contrast',     group: 'contrast' },
    'dark-contrast':      { class: 'h2s-dark-contrast',     group: 'contrast' },
    // Invert colors is an INDEPENDENT feature (no mutually-exclusive group),
    // so it can be combined with contrast mode without one cancelling the other.
    'invert':             { class: 'h2s-inverted' },
    'monochrome':         { class: 'h2s-monochrome',        group: 'contrast' },
    'low-saturation':     { class: 'h2s-low-saturation',    group: 'saturation' },
    'high-saturation':    { class: 'h2s-high-saturation',   group: 'saturation' },
    'hide-images':        { class: 'h2s-hide-images' },
    'stop-animations':    { class: 'h2s-stop-animations' },
    'big-cursor':         { class: 'h2s-big-cursor' },
    'focus-highlight':    { class: 'h2s-focus-highlight' },
    'highlight-links':    { class: 'h2s-highlight-links' },
    'dyslexia-font':      { class: 'h2s-dyslexia-font' },
    'text-spacing-light': { class: 'h2s-text-spacing-light', group: 'spacing' },
    'text-spacing-heavy': { class: 'h2s-text-spacing-heavy', group: 'spacing' },
    'line-height-light':  { class: 'h2s-line-height-light',  group: 'lineheight' },
    'line-height-heavy':  { class: 'h2s-line-height-heavy',  group: 'lineheight' },
    'text-align-left':    { class: 'h2s-text-left',          group: 'align' },
    'text-align-center':  { class: 'h2s-text-center',        group: 'align' },
    'text-align-right':   { class: 'h2s-text-right',         group: 'align' },
    // Effect-driven (no class) features:
    'reading-mask':       { effect: 'mask' },
    'reading-guide':      { effect: 'guide' },
    'magnifier':          { effect: 'magnifier' },
    'hover-reader':       { effect: 'hover' },
    'keyboard-reader':    { effect: 'keyboard' },
  };

  function membersOfGroup(group) {
    return Object.keys(FEATURES).filter(id => FEATURES[id].group === group);
  }

  // ============================================================
  // PANEL CONTENT RENDERERS  (UI)
  // ============================================================
  function renderTab(tabId) {
    switch (tabId) {
      case 'visual': return renderVisualTab();
      case 'text': return renderTextTab();
      case 'nav': return renderNavTab();
      case 'reading': return renderReadingTab();
      case 'profiles': return renderProfilesTab();
      default: return renderVisualTab();
    }
  }

  function featureBtn(id, iconKey, label, wide = false) {
    const active = isFeatureActive(id);
    const cls = wide ? 'h2s-btn-full' : 'h2s-btn';
    const pressed = active ? 'true' : 'false';
    if (wide) {
      return `<button class="${cls}${active ? ' h2s-active' : ''}" data-feature="${id}" aria-pressed="${pressed}" title="${label}">
        ${icon(iconKey, 18)}<span>${label}</span>
      </button>`;
    }
    return `<button class="${cls}${active ? ' h2s-active' : ''}" data-feature="${id}" aria-pressed="${pressed}" title="${label}">
      <span class="h2s-btn-icon">${icon(iconKey, 22)}</span>
      <span class="h2s-btn-label">${label}</span>
    </button>`;
  }

  // Feature buttons resolve their visible label + title from t('feat.<id>'),
  // so the panel is fully localized with no per-tab string duplication.
  function feat(id, iconKey, wide) {
    return featureBtn(id, iconKey, t('feat.' + id), wide);
  }

  function renderVisualTab() {
    return `
      <p class="h2s-section-title">${t('section.contrast')}</p>
      <div class="h2s-grid">
        ${feat('high-contrast', 'contrast')}
        ${feat('dark-contrast', 'contrast')}
        ${feat('invert', 'contrast')}
        ${feat('monochrome', 'eye')}
      </div>
      <p class="h2s-section-title">${t('section.saturation')}</p>
      <div class="h2s-grid">
        ${feat('low-saturation', 'eye')}
        ${feat('high-saturation', 'eye')}
        ${feat('hide-images', 'image')}
        ${feat('stop-animations', 'animation')}
      </div>
      <p class="h2s-section-title">${t('section.cursorScreen')}</p>
      <div class="h2s-grid">
        ${feat('big-cursor', 'cursor')}
        ${feat('reading-mask', 'mask')}
        ${feat('reading-guide', 'guide')}
        ${feat('magnifier', 'magnify')}
      </div>
    `;
  }

  function renderTextTab() {
    const scale = state.textScaleFactor;
    const pct = Math.round(scale * 100);
    return `
      <p class="h2s-section-title">${t('section.size')}</p>
      <div class="h2s-slider-wrap">
        <div class="h2s-slider-label"><span>${t('aria.textSize')}</span><span id="h2s-text-scale-val">${pct}%</span></div>
        <input class="h2s-slider" type="range" id="h2s-text-slider" min="80" max="165" value="${pct}" aria-label="${t('aria.textSize')}" aria-valuemin="80" aria-valuemax="165" aria-valuenow="${pct}">
      </div>
      <p class="h2s-section-title">${t('section.spacing')}</p>
      <div class="h2s-grid">
        ${feat('text-spacing-light', 'text')}
        ${feat('text-spacing-heavy', 'text')}
        ${feat('line-height-light', 'text')}
        ${feat('line-height-heavy', 'text')}
      </div>
      <p class="h2s-section-title">${t('section.style')}</p>
      <div class="h2s-grid">
        ${feat('dyslexia-font', 'text')}
        ${feat('text-align-left', 'text')}
        ${feat('text-align-center', 'text')}
        ${feat('text-align-right', 'text')}
      </div>
    `;
  }

  function renderNavTab() {
    const cmds = ['nav.cmdReadPage', 'nav.cmdStop', 'nav.cmdOpenMenu', 'nav.cmdCloseMenu',
      'nav.cmdContrast', 'nav.cmdMagnifier', 'nav.cmdBigger', 'nav.cmdBack'];
    return `
      <p class="h2s-section-title">${t('section.focusNav')}</p>
      <div class="h2s-grid">
        ${feat('focus-highlight', 'eye')}
        ${feat('highlight-links', 'link')}
        ${feat('keyboard-reader', 'keyboard')}
        ${feat('hover-reader', 'voice')}
      </div>
      <p class="h2s-section-title">${t('section.voice')}</p>
      ${feat('voice-nav', 'voice', true)}
      <div id="h2s-voice-cmds" style="display:${isFeatureActive('voice-nav') ? 'block' : 'none'};padding:10px 12px;background:var(--h2s-surface);border-radius:8px;font-size:11.5px;color:var(--h2s-text-muted);margin-bottom:6px;">
        <strong style="color:var(--h2s-text);display:block;margin-bottom:6px;">${t('nav.voiceCommands')}</strong>
        <ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:3px;">
          ${cmds.map(c => `<li>• "${escapeHtml(t(c))}"</li>`).join('')}
        </ul>
      </div>
      <p class="h2s-section-title">${t('section.pageStructure')}</p>
      <button class="h2s-btn-full" id="h2s-headings-nav" aria-expanded="${state.headingsOpen ? 'true' : 'false'}" aria-controls="h2s-headings-list" title="${t('nav.headingsNav')}">
        ${icon('read', 18)}<span>${t('nav.headingsNav')}</span>
      </button>
      <div id="h2s-headings-list" role="region" aria-label="${t('nav.headingsNav')}" style="display:${state.headingsOpen ? 'block' : 'none'};max-height:200px;overflow-y:auto;margin-bottom:8px;font-size:12px;">${state.headingsOpen ? buildHeadingsList() : ''}</div>
    `;
  }

  function renderReadingTab() {
    const rate = Math.round(state.speechRate * 100);
    return `
      <p class="h2s-section-title">${t('section.readAloud')}</p>
      ${featureBtn('read-page', 'read', t('btn.readPage'), true)}
      ${featureBtn('read-selected', 'read', t('btn.readSelected'), true)}
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <button class="h2s-btn-full" id="h2s-pause-reading" style="flex:1" title="${t('btn.pause')}">${icon('pause', 18)}<span>${t('btn.pause')}</span></button>
        <button class="h2s-btn-full" id="h2s-resume-reading" style="flex:1" title="${t('btn.resume')}">${icon('play', 18)}<span>${t('btn.resume')}</span></button>
        <button class="h2s-btn-full" id="h2s-stop-reading" style="flex:1" title="${t('btn.stop')}">${icon('stop', 18)}<span>${t('btn.stop')}</span></button>
      </div>
      <p class="h2s-section-title">${t('section.readingSpeed')}</p>
      <div class="h2s-slider-wrap">
        <div class="h2s-slider-label"><span>${t('label.speed')}</span><span id="h2s-speech-rate-val">${speechRateLabel(rate)}</span></div>
        <input class="h2s-slider" type="range" id="h2s-speech-rate" min="50" max="200" value="${rate}" step="10" aria-label="${t('aria.readingSpeed')}">
      </div>
    `;
  }

  const PROFILES = [
    { id: 'dyslexia', label: 'Dislexia', icon: '🧠', features: ['dyslexia-font', 'text-spacing-light', 'line-height-light', 'high-contrast'] },
    { id: 'low-vision', label: 'Baixa visão', icon: '👁️', features: ['high-contrast', 'big-cursor', 'focus-highlight', 'highlight-links'] },
    { id: 'senior', label: 'Idoso', icon: '🧓', features: ['focus-highlight', 'highlight-links', 'big-cursor', 'line-height-light'] },
    { id: 'adhd', label: 'ADHD', icon: '⚡', features: ['stop-animations', 'reading-mask', 'high-contrast'] },
    { id: 'autism', label: 'Autismo', icon: '🌀', features: ['low-saturation', 'stop-animations', 'reading-guide'] },
    { id: 'cognitive', label: 'Cognitivo', icon: '💡', features: ['dyslexia-font', 'line-height-heavy', 'text-spacing-light', 'focus-highlight'] },
    { id: 'motor', label: 'Motor', icon: '🤚', features: ['keyboard-reader', 'big-cursor', 'focus-highlight'] },
  ];

  function renderProfilesTab() {
    return `
      <p class="h2s-section-title">${t('section.profiles')}</p>
      ${PROFILES.map(p => {
        const name = t('profile.' + p.id);
        return `
        <button class="h2s-profile-btn${state.activeProfile === p.id ? ' h2s-active' : ''}" data-profile="${p.id}" aria-pressed="${state.activeProfile === p.id}" title="${escapeHtml(t('profile.enableTitle', { name }))}">
          <span class="h2s-profile-icon" aria-hidden="true">${p.icon}</span>
          <div>
            <div style="font-weight:700">${escapeHtml(t('profile.cardTitle', { name }))}</div>
            <div style="font-size:11px;opacity:0.75;margin-top:2px">${escapeHtml(t('profile.featuresEnabled', { n: p.features.length }))}</div>
          </div>
        </button>
      `;
      }).join('')}
      <button class="h2s-reset-btn" id="h2s-profile-reset">${t('profile.clear')}</button>
    `;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ============================================================
  // DOM CONSTRUCTION  (UI)
  // ============================================================
  function buildWidget() {
    const trigger = document.createElement('button');
    trigger.id = TRIGGER_ID;
    trigger.type = 'button';
    trigger.setAttribute('aria-label', t('aria.openMenu'));
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', PANEL_ID);
    trigger.title = t('aria.triggerTitle');
    // Branding: reuse the existing Help2See logo asset (see LOGO_DATA_URI).
    trigger.innerHTML = `<img src="${LOGO_DATA_URI}" alt="" class="h2s-trigger-logo" aria-hidden="true" draggable="false">`;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('aria.panelLabel'));
    panel.setAttribute('aria-modal', 'true');
    panel.tabIndex = -1;
    panel.innerHTML = buildPanelHTML();

    document.body.appendChild(trigger);
    document.body.appendChild(panel);

    setPosition(config.position);
    applyTheme(config.theme);
  }

  function buildPanelHTML(activeTab = 'visual') {
    // Labels resolve via t() HERE (outside the map below, where `t` is
    // shadowed by the tab object). Adding a language needs no change here.
    const tabs = [
      { id: 'visual', label: t('tab.visual') },
      { id: 'text', label: t('tab.text') },
      { id: 'nav', label: t('tab.nav') },
      { id: 'reading', label: t('tab.reading') },
      { id: 'profiles', label: t('tab.profiles') },
    ];

    // Language options (endonyms — identical in every locale).
    const langOptions = SUPPORTED_LANGS.map(function (l) {
      return `<option value="${l}"${l === state.language ? ' selected' : ''}>${LANG_NAMES[l]}</option>`;
    }).join('');

    return `
      <div class="h2s-header">
        <div class="h2s-header-left">
          <div class="h2s-logo">
            <img src="${LOGO_DATA_URI}" alt="" class="h2s-logo-img" aria-hidden="true" draggable="false">
          </div>
          <div>
            <div class="h2s-title">Help2See</div>
            <div class="h2s-subtitle">${t('panel.subtitle')}</div>
          </div>
        </div>
        <div class="h2s-header-actions">
          <button class="h2s-header-btn" type="button" id="h2s-toggle-theme" title="${escapeHtml(t('aria.toggleThemeTitle'))}" aria-label="${escapeHtml(t('aria.toggleThemeLabel'))}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          </button>
          <button class="h2s-header-btn" type="button" id="h2s-close-panel" title="${escapeHtml(t('aria.closeTitle'))}" aria-label="${escapeHtml(t('aria.closeLabel'))}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div class="h2s-tabs" role="tablist" aria-label="${escapeHtml(t('aria.tablistLabel'))}">
        ${tabs.map(t => `
          <button class="h2s-tab${t.id === activeTab ? ' h2s-tab-active' : ''}" type="button"
            data-tab="${t.id}" role="tab"
            aria-selected="${t.id === activeTab}"
            tabindex="${t.id === activeTab ? '0' : '-1'}"
            aria-controls="h2s-tab-panel"
            id="h2s-tab-${t.id}">${t.label}</button>
        `).join('')}
      </div>

      <div class="h2s-body" id="h2s-tab-panel" role="tabpanel" aria-labelledby="h2s-tab-${activeTab}" tabindex="0">
        ${renderTab(activeTab)}
      </div>

      <div class="h2s-footer">
        <div class="h2s-lang">
          <span class="h2s-lang-icon" aria-hidden="true">${icon('globe', 15)}</span>
          <select id="h2s-lang-select" class="h2s-lang-select" aria-label="${escapeHtml(t('aria.langLabel'))}">
            ${langOptions}
          </select>
        </div>
        <button type="button" class="h2s-link" id="h2s-accessibility-stmt">${t('footer.statement')}</button>
        <span class="h2s-brand">Help<span>2</span>See</span>
      </div>

      <div class="h2s-sr-only" id="h2s-live" role="status" aria-live="polite"></div>
    `;
  }

  // ============================================================
  // PANEL OPEN / CLOSE  (UI)
  // ============================================================
  function openPanel() {
    const panel = document.getElementById(PANEL_ID);
    const trigger = document.getElementById(TRIGGER_ID);
    if (!panel || state.panelOpen) return;
    state.panelOpen = true;
    panel.classList.add('h2s-panel-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    panel.focus();
    try { Analytics.track('plugin_opened', null); } catch (e) { /* telemetria opcional */ }
  }

  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    const trigger = document.getElementById(TRIGGER_ID);
    if (!panel || !state.panelOpen) return;
    state.panelOpen = false;
    panel.classList.remove('h2s-panel-open');
    if (trigger) { trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); }
    try { Analytics.track('plugin_closed', null); } catch (e) { /* telemetria opcional */ }
  }

  function announce(msg) {
    const live = document.getElementById('h2s-live');
    if (live) live.textContent = msg;
  }

  // Short SPOKEN feedback for navigation / toggle actions (active language).
  // Unlike
  // announce() — which only updates the silent aria-live region for assistive
  // tech — this voices a brief phrase out loud so sighted-but-low-vision and
  // keyboard-only users hear what just happened ("Botão: Enviar", etc.).
  //
  // It uses the always-available Web Speech API directly (free, instant, no
  // network) rather than the heavy ElevenLabs page-reading pipeline: feedback
  // must be immediate and must not pollute the TTS state machine. Each call
  // cancels the previous feedback utterance (no overlap, no leak). We do not
  // touch ttsEngine here, avoiding any race with page reading.
  let _feedbackUtter = null;
  function speakFeedback(msg) {
    announce(msg);                                  // keep assistive tech in sync
    if (!msg) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(msg));
      u.lang = ttsLang();
      u.rate = Math.min(2, Math.max(0.5, state.speechRate || 0.95));
      _feedbackUtter = u;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  // Cancel any in-flight spoken feedback. Returns true if something was
  // actually speaking (used by the ESC handler to "stop contextual reading").
  function cancelFeedback() {
    if (!('speechSynthesis' in window)) return false;
    const wasSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
    if (_feedbackUtter || wasSpeaking) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
      _feedbackUtter = null;
      return wasSpeaking;
    }
    return false;
  }
  // ============================================================
  // FOCUS TRAP  (UI)
  // ============================================================
  function getFocusableElements(container) {
    return Array.from(container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.disabled && el.getClientRects().length > 0);
  }

  function handleFocusTrap(e) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || !state.panelOpen) return;
    if (e.key === 'Escape') { closePanel(); return; }
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements(panel);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  // ============================================================
  // EVENT DELEGATION  (UI) — one click + one input handler bound
  // once at build time. Tab switches only swap innerHTML, so these
  // survive and never need rebinding → no duplication, no leaks.
  // ============================================================
  function attachWidgetListeners() {
    const panel = document.getElementById(PANEL_ID);
    const trigger = document.getElementById(TRIGGER_ID);
    if (panel) {
      panel.addEventListener('click', onPanelClick);
      panel.addEventListener('input', onPanelInput);
      panel.addEventListener('change', onPanelChange);
      panel.addEventListener('keydown', onPanelKeydown);
    }
    if (trigger) {
      trigger.addEventListener('click', onTriggerClick);
    }
    makeDraggable();
  }

  function onTriggerClick(e) {
    if (trigger_wasDragged()) return; // ignore the click that ends a drag
    state.panelOpen ? closePanel() : openPanel();
  }

  function onPanelClick(e) {
    const tgt = e.target;

    // Tabs
    const tab = tgt.closest('.h2s-tab');
    if (tab) { switchTab(tab.dataset.tab); return; }

    // Heading nav item
    const heading = tgt.closest('[data-h2s-heading]');
    if (heading) {
      const idx = parseInt(heading.dataset.h2sHeading, 10);
      const all = pageHeadings();
      const el = all[idx];
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (el.tabIndex < 0) el.tabIndex = -1; el.focus({ preventScroll: true }); }
      return;
    }

    // Profile
    const profile = tgt.closest('[data-profile]');
    if (profile) { applyProfile(profile.dataset.profile); return; }

    // Header buttons
    if (tgt.closest('#h2s-close-panel')) { closePanel(); return; }
    if (tgt.closest('#h2s-toggle-theme')) { toggleTheme(); return; }

    // Footer statement (announces the accessibility-statement label).
    if (tgt.closest('#h2s-accessibility-stmt')) { e.preventDefault(); announce(t('footer.statement')); return; }

    // Reading controls
    if (tgt.closest('#h2s-pause-reading')) { pauseReading(); return; }
    if (tgt.closest('#h2s-resume-reading')) { resumeReading(); return; }
    if (tgt.closest('#h2s-stop-reading')) { stopReading(); setFeatureActive('read-page', false); return; }

    // Profile reset / headings toggle
    if (tgt.closest('#h2s-profile-reset')) { clearProfile(); return; }
    if (tgt.closest('#h2s-headings-nav')) { toggleHeadingsList(); return; }

    // Feature buttons (generic + special-cased read/voice)
    const fbtn = tgt.closest('[data-feature]');
    if (fbtn) {
      const id = fbtn.dataset.feature;
      if (id === 'read-page') {
        if (isFeatureActive('read-page')) { stopReading(); setFeatureActive('read-page', false); }
        else { readPage(); setFeatureActive('read-page', true); }
        return;
      }
      if (id === 'read-selected') { readSelectedText(); return; }
      if (id === 'voice-nav') {
        if (isFeatureActive('voice-nav')) { stopVoiceNavigation(); setFeatureActive('voice-nav', false); }
        else { startVoiceNavigation(); setFeatureActive('voice-nav', true); }
        const cmds = document.getElementById('h2s-voice-cmds');
        if (cmds) cmds.style.display = isFeatureActive('voice-nav') ? 'block' : 'none';
        return;
      }
      if (id === 'invert') { toggleInvertColors(); return; }
      toggleFeature(id);
      return;
    }
  }

  let _textScaleTimer = 0;
  function onPanelInput(e) {
    const t = e.target;
    if (t.id === 'h2s-text-slider') {
      const val = parseInt(t.value, 10);
      const lbl = document.getElementById('h2s-text-scale-val');
      if (lbl) lbl.textContent = val + '%';        // instant, cheap feedback
      t.setAttribute('aria-valuenow', String(val));
      // Debounce the (expensive) per-element rescale so dragging the slider
      // does not run two full-DOM traversals on every intermediate tick.
      if (_textScaleTimer) clearTimeout(_textScaleTimer);
      _textScaleTimer = setTimeout(function () { _textScaleTimer = 0; applyTextScale(val / 100); }, 150);
      return;
    }
    if (t.id === 'h2s-speech-rate') {
      const val = parseInt(t.value, 10);
      state.speechRate = val / 100;
      const lbl = document.getElementById('h2s-speech-rate-val');
      if (lbl) lbl.textContent = speechRateLabel(val);
      return;
    }
  }

  // 'change' fires for the language <select> across all browsers (older
  // engines don't fire 'input' on <select>), so it gets its own handler.
  function onPanelChange(e) {
    if (e.target && e.target.id === 'h2s-lang-select') {
      setLanguage(e.target.value);
    }
  }

  // Arrow-key navigation for the tablist (WCAG tabs pattern).
  function onPanelKeydown(e) {
    const tab = e.target.closest('.h2s-tab');
    if (!tab) return;
    const tabs = Array.from(document.querySelectorAll('#h2s-panel .h2s-tab'));
    const i = tabs.indexOf(tab);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      switchTab(tabs[next].dataset.tab);
      const focusTab = document.querySelector(`#h2s-panel .h2s-tab[data-tab="${tabs[next].dataset.tab}"]`);
      if (focusTab) focusTab.focus();
    }
  }

  function speechRateLabel(val) {
    const labels = {
      50: t('rate.slow'), 75: t('rate.slower'), 100: t('rate.normal'),
      125: t('rate.faster'), 150: t('rate.fast'), 175: t('rate.veryFast'), 200: t('rate.max')
    };
    return labels[val] || val + '%';
  }

  function switchTab(tabId) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.querySelectorAll('.h2s-tab').forEach(t => {
      const active = t.dataset.tab === tabId;
      t.classList.toggle('h2s-tab-active', active);
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
    });
    const body = panel.querySelector('.h2s-body');
    if (body) {
      body.innerHTML = renderTab(tabId);
      body.setAttribute('aria-labelledby', `h2s-tab-${tabId}`);
    }
  }

  // ============================================================
  // FEATURE TOGGLES  (Features)
  // ============================================================
  function toggleFeature(id) {
    const newActive = !isFeatureActive(id);
    setFeatureActive(id, newActive);   // único choke-point: emite 'a11y_toggle'
    applyFeature(id, newActive);
    // Telemetria fica a cargo de setFeatureActive() (cobre painel, teclado e voz
    // em um só ponto). Não emitimos 'feature_used' aqui para não contar em dobro.
  }

  // ── INVERT COLORS (ACTION_TOGGLE_INVERT_COLORS) ──────────────
  // Dedicated wrappers so the keyboard shortcut (Ctrl+Alt+V), the voice
  // commands and the panel button all share ONE code path and produce the
  // same pt-BR feedback. Invert is an independent feature (no group), so it
  // composes with contrast mode without either cancelling the other.
  function setInvertColors(on) {
    if (isFeatureActive('invert') === on) {        // already in the target state
      announceInvertState(on);
      return;
    }
    setFeatureActive('invert', on);                // syncs panel button + persists
    applyFeature('invert', on);                    // toggles .h2s-inverted on <html>
    announceInvertState(on);
  }

  function toggleInvertColors() {
    setInvertColors(!isFeatureActive('invert'));
  }

  function announceInvertState(on) {
    const msg = on ? t('notif.invertOn') : t('notif.invertOff');
    showNotification((on ? '🌓 ' : '') + msg);
    speakFeedback(msg);
  }

  function applyFeature(id, active) {
    const html = document.documentElement;
    const def = FEATURES[id];
    if (!def) return;

    // Mutually-exclusive group handling.
    if (active && def.group) {
      membersOfGroup(def.group).forEach(g => {
        if (g !== id && isFeatureActive(g)) {
          setFeatureActive(g, false);
          if (FEATURES[g].class) html.classList.remove(FEATURES[g].class);
        }
      });
    }

    if (def.class) {
      html.classList.toggle(def.class, active);
    }

    switch (def.effect) {
      case 'mask': toggleReadingMask(active); break;
      case 'guide': toggleReadingGuide(active); break;
      case 'magnifier': toggleMagnifier(active); break;
      case 'hover': toggleHoverReader(active); break;
      case 'keyboard': toggleKeyboardReader(active); break;
    }
  }

  // ============================================================
  // TEXT SCALE  (Features) — per-element scaling.
  //
  // Setting `html { font-size }` only scales sites authored in rem/em.
  // Most pages (this one included) hard-code font sizes in `px`, which
  // ignore the root size entirely, so that approach silently did nothing.
  // Instead we record each element's ORIGINAL computed font-size once and
  // re-emit it multiplied by `scale`, so px-based layouts scale too.
  // ============================================================
  const TEXT_SCALE_ATTR = 'data-h2s-fs';
  const TEXT_SCALE_SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, CANVAS: 1, IMG: 1, BR: 1, HR: 1, IFRAME: 1, VIDEO: 1, AUDIO: 1 };
  // Scale bounds. Capped at 1.65 (165%): beyond it the page layout breaks
  // (e.g. the navbar login button is pushed off-screen). The cap is enforced
  // here so it also covers persisted prefs and voice/keyboard zoom-in.
  const TEXT_SCALE_MIN = 0.8;
  const TEXT_SCALE_MAX = 1.65;

  // Elements eligible for text scaling — everything under <body> except the
  // Help2See widget itself, non-text tags, and SVG internals.
  function textScaleTargets() {
    if (!document.body) return [];
    const panel = document.getElementById(PANEL_ID);
    const trigger = document.getElementById(TRIGGER_ID);
    return Array.from(document.body.querySelectorAll('*')).filter(el => {
      if (TEXT_SCALE_SKIP[el.tagName]) return false;
      if (panel && (el === panel || panel.contains(el))) return false;
      if (trigger && (el === trigger || trigger.contains(el))) return false;
      if (el.closest && (el.closest('svg') || el.closest('[vw]'))) return false; // skip SVGs + VLibras widget
      return true;
    });
  }

  function applyTextScale(scale, silent) {
    scale = Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, scale));
    state.textScaleFactor = scale;
    const els = textScaleTargets();

    // Pass 1 — capture each element's original font-size BEFORE writing any
    // inline styles, so inherited sizes aren't read back after a parent was
    // already scaled (which would compound the factor).
    els.forEach(el => {
      if (el.getAttribute(TEXT_SCALE_ATTR) == null) {
        const px = parseFloat(getComputedStyle(el).fontSize) || 0;
        el.setAttribute(TEXT_SCALE_ATTR, px);
      }
    });

    // Pass 2 — apply (or clear at 100%) the scaled size.
    els.forEach(el => {
      const base = parseFloat(el.getAttribute(TEXT_SCALE_ATTR));
      if (!base) return;
      if (scale === 1) {
        el.style.removeProperty('font-size');
        el.removeAttribute(TEXT_SCALE_ATTR);
      } else {
        el.style.setProperty('font-size', (base * scale).toFixed(2) + 'px', 'important');
      }
    });

    // Telemetria: registra a escala de fonte escolhida pelo usuário (slider,
    // teclado, voz). Restaurar prefs, reset e teardown passam `silent` para não
    // gerar eventos espúrios no carregamento.
    if (!silent) {
      try { Analytics.track('settings_changed', { setting: 'text_scale', value: scale }); } catch (e) { /* telemetria opcional */ }
    }
    savePrefs();
  }

  // ============================================================
  // READING MASK  (Effects) — rAF-throttled, no reflow thrash.
  // ============================================================
  function toggleReadingMask(active) {
    if (active) {
      if (document.getElementById('h2s-mask-top')) return;
      const maskTop = document.createElement('div');
      maskTop.className = 'h2s-mask-top'; maskTop.id = 'h2s-mask-top';
      const maskBottom = document.createElement('div');
      maskBottom.className = 'h2s-mask-bottom'; maskBottom.id = 'h2s-mask-bottom';
      document.body.appendChild(maskTop);
      document.body.appendChild(maskBottom);

      let lastY = window.innerHeight / 2;
      const paint = rafThrottle('mask', () => {
        const windowH = window.innerHeight, maskH = 60;
        maskTop.style.height = Math.max(0, lastY - maskH / 2) + 'px';
        maskBottom.style.height = Math.max(0, windowH - lastY - maskH / 2) + 'px';
      });
      const onMove = (e) => { lastY = pointerY(e); paint(); };
      addDocListener('maskMove', 'mousemove', onMove);
      addDocListener('maskTouch', 'touchmove', onMove, { passive: true });
      paint();
    } else {
      cancelRaf('mask');
      removeDocListener('maskMove'); removeDocListener('maskTouch');
      const t = document.getElementById('h2s-mask-top');
      const b = document.getElementById('h2s-mask-bottom');
      if (t) t.remove(); if (b) b.remove();
    }
  }

  // ============================================================
  // READING GUIDE  (Effects)
  // ============================================================
  function toggleReadingGuide(active) {
    if (active) {
      if (document.getElementById('h2s-reading-guide')) return;
      const guide = document.createElement('div');
      guide.className = 'h2s-reading-guide'; guide.id = 'h2s-reading-guide';
      document.body.appendChild(guide);

      let lastY = 0;
      const paint = rafThrottle('guide', () => { guide.style.top = lastY + 'px'; });
      const onMove = (e) => { lastY = pointerY(e); paint(); };
      addDocListener('guideMove', 'mousemove', onMove);
      addDocListener('guideTouch', 'touchmove', onMove, { passive: true });
    } else {
      cancelRaf('guide');
      removeDocListener('guideMove'); removeDocListener('guideTouch');
      const g = document.getElementById('h2s-reading-guide');
      if (g) g.remove();
    }
  }

  // ============================================================
  // MAGNIFIER  (Effects) — real, clone-based, transform-only tracking.
  // Snapshot the page once (and on throttled scroll/resize); every
  // mousemove only updates a transform → smooth, no flicker, no shift.
  // ============================================================
  function toggleMagnifier(active) {
    if (active) {
      if (document.getElementById('h2s-magnifier-lens')) return;
      const zoom = 2;
      const lens = document.createElement('div');
      lens.id = 'h2s-magnifier-lens';
      lens.className = 'h2s-magnifier';
      const inner = document.createElement('div');
      inner.className = 'h2s-magnifier-inner';
      lens.appendChild(inner);
      document.body.appendChild(lens);

      let lastX = 0, lastY = 0;

      function snapshot() {
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll(
          '#h2s-panel, #h2s-trigger, #h2s-magnifier-lens, #h2s-notif, #h2s-mask-top, #h2s-mask-bottom, #h2s-reading-guide, #h2s-voice-dot, script, style'
        ).forEach(n => n.remove());
        clone.setAttribute('aria-hidden', 'true');
        clone.style.position = 'absolute';
        clone.style.top = '0';
        clone.style.left = '0';
        clone.style.margin = '0';
        clone.style.width = document.documentElement.scrollWidth + 'px';
        clone.style.minHeight = document.documentElement.scrollHeight + 'px';
        clone.style.pointerEvents = 'none';
        inner.textContent = '';
        inner.appendChild(clone);
      }

      const render = rafThrottle('magnifier', () => {
        const lw = lens.offsetWidth, lh = lens.offsetHeight;
        const px = lastX + window.scrollX;
        const py = lastY + window.scrollY;
        inner.style.transform = `translate(${lw / 2 - px * zoom}px, ${lh / 2 - py * zoom}px) scale(${zoom})`;
      });

      const onMove = (e) => {
        lastX = e.clientX || 0; lastY = e.clientY || 0;
        lens.style.left = lastX + 'px';
        lens.style.top = lastY + 'px';
        lens.style.display = 'block';
        render();
      };
      const onLeave = () => { lens.style.display = 'none'; };
      const onScrollResize = rafThrottle('magnifierSnap', () => { snapshot(); render(); });

      addDocListener('magMove', 'mousemove', onMove);
      addDocListener('magLeave', 'mouseleave', onLeave);
      window.addEventListener('scroll', onScrollResize, { passive: true });
      window.addEventListener('resize', onScrollResize);
      state._magWindowHandler = onScrollResize;

      snapshot();
      announce(t('notif.magnifierHint'));
      showNotification(t('notif.magnifierHint'));
    } else {
      cancelRaf('magnifier'); cancelRaf('magnifierSnap');
      removeDocListener('magMove'); removeDocListener('magLeave');
      if (state._magWindowHandler) {
        window.removeEventListener('scroll', state._magWindowHandler);
        window.removeEventListener('resize', state._magWindowHandler);
        state._magWindowHandler = null;
      }
      const lens = document.getElementById('h2s-magnifier-lens');
      if (lens) lens.remove();
    }
  }

  // ============================================================
  // HOVER READER  (Effects)
  // ============================================================
  function toggleHoverReader(active) {
    if (active) {
      let hoverTimer = null;
      const onHover = (e) => {
        clearTimeout(hoverTimer);
        const el = e.target;
        hoverTimer = setTimeout(() => {
          if (!el || el.closest('#h2s-panel') || el.closest('#h2s-trigger')) return;
          const text = el.getAttribute('aria-label') || (el.textContent ? el.textContent.trim() : '');
          if (text && text.length > 2) {
            speakText(text.substring(0, 300));
            el.style.outline = '2px solid var(--h2s-primary)';
            setTimeout(() => { if (el.style) el.style.outline = ''; }, 1500);
          }
        }, 600);
      };
      addDocListener('hoverReader', 'mouseover', onHover);
      state._hoverTimerClear = () => clearTimeout(hoverTimer);
    } else {
      removeDocListener('hoverReader');
      if (state._hoverTimerClear) { state._hoverTimerClear(); state._hoverTimerClear = null; }
      stopReading(); // provider-aware: stops premium audio and/or browser voice
    }
  }

  // ============================================================
  // KEYBOARD READER  (Effects)
  // ============================================================
  function toggleKeyboardReader(active) {
    if (active) {
      const onFocus = (e) => {
        const el = e.target;
        if (!el || el.closest('#h2s-panel')) return;
        const text = el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('title') ||
          (el.textContent ? el.textContent.trim() : '') || '';
        if (text) speakText(text.substring(0, 200));
      };
      addDocListener('keyboardReader', 'focusin', onFocus);
    } else {
      removeDocListener('keyboardReader');
      stopReading(); // provider-aware: stops premium audio and/or browser voice
    }
  }

  // ============================================================
  // VOICE PROVIDERS + TTS ENGINE  (Speech) — caching-first, cost-optimized.
  //
  //   VoiceProvider           → interface every provider implements
  //   BrowserVoiceProvider    → free, offline fallback (Web Speech API)
  //   ElevenLabsVoiceProvider → natural voice via the Help2See backend.
  //                             The browser NEVER talks to ElevenLabs
  //                             directly and NEVER sees the API key — all
  //                             requests are proxied through FastAPI.
  //
  // The PRIMARY goal of this subsystem is to MINIMISE ElevenLabs API cost:
  //   • normalize + de-duplicate text before any request,
  //   • split into sentence-aware chunks (never mid-word),
  //   • cache synthesized audio by hash(text + voice) — cache HIT = no API call,
  //   • de-duplicate in-flight requests (reuse the pending promise),
  //   • play strictly sequentially (one request at a time, no parallel fetch),
  //   • LRU-evict + revoke object URLs so long sessions never leak memory,
  //   • debounce triggers so rapid clicks can't fan out into many requests.
  //
  // Custom providers can still be registered without touching the engine:
  //   Help2See.registerVoiceProvider('openai', new OpenAITTSProvider());
  // A provider exposing synthesize()->Promise<objectUrl> uses the cached
  // audio pipeline; one exposing only speak() uses the legacy direct path.
  // ============================================================

  // Hard ceiling per read (matches backend TTSRequest.max_length = 5000).
  const MAX_TTS_CHARS = 5000;
  const CHUNK_MIN = 300;
  const CHUNK_MAX = 600;
  const TTS_DEBOUNCE_MS = 400;   // min gap between triggers (anti rapid-click)
  const AUDIO_CACHE_MAX = 80;    // LRU capacity (cached MP3 object URLs)

  // ── Text pipeline helpers ──────────────────────────────────

  // Split into sentences WITHOUT lookbehind (older Safari lacks it). Keeps
  // terminal punctuation attached to each sentence.
  function splitSentences(text) {
    return String(text).match(/[^.!?…]+(?:[.!?…]+|$)/g) || (text ? [String(text)] : []);
  }

  // Collapse whitespace, strip control/zero-width chars, drop consecutive
  // duplicate sentences (boilerplate), and cap length. Stable output → stable
  // cache keys → maximum cache reuse.
  function normalizeText(raw) {
    let t = String(raw == null ? '' : raw);
    t = t.replace(/\u00a0/g, ' ');                 // nbsp → space
    t = t.replace(/[\u200B-\u200D\uFEFF]/g, '');    // zero-width chars
    t = t.replace(/\s+/g, ' ').trim();              // collapse all whitespace
    if (!t) return '';
    const parts = splitSentences(t);
    const out = [];
    let prev = '';
    for (let i = 0; i < parts.length; i++) {
      const s = parts[i].trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (key === prev) continue;                   // skip repeated sentence
      out.push(s);
      prev = key;
    }
    t = out.join(' ').trim();
    if (t.length > MAX_TTS_CHARS) t = t.slice(0, MAX_TTS_CHARS);
    return t;
  }

  // Sentence-aware chunking. Packs whole sentences up to `max`; a single
  // over-long sentence is split on word boundaries (never mid-word), with a
  // hard slice only as a last resort for a pathological single token.
  function chunkText(text, max) {
    const clean = String(text).trim();
    if (!clean) return [];
    if (clean.length <= max) return [clean];
    const sentences = splitSentences(clean);
    const chunks = [];
    let buf = '';
    const flush = () => { const v = buf.trim(); if (v) chunks.push(v); buf = ''; };
    for (let i = 0; i < sentences.length; i++) {
      let s = sentences[i].trim();
      if (!s) continue;
      if (s.length > max) {
        flush();
        const words = s.split(/\s+/);
        let line = '';
        for (let w = 0; w < words.length; w++) {
          let word = words[w];
          while (word.length > max) {              // pathological single token
            if (line) { chunks.push(line.trim()); line = ''; }
            chunks.push(word.slice(0, max));
            word = word.slice(max);
          }
          if ((line ? line.length + 1 : 0) + word.length > max) {
            if (line) chunks.push(line.trim());
            line = word;
          } else {
            line = line ? line + ' ' + word : word;
          }
        }
        if (line.trim()) buf = line.trim();         // carry remainder forward
        continue;
      }
      if (!buf) buf = s;
      else if ((buf.length + 1 + s.length) <= max) buf += ' ' + s;
      else { flush(); buf = s; }
    }
    flush();
    return chunks;
  }

  // FNV-1a 32-bit hash → 8-char hex. Fast, dependency-free, good enough to
  // key the audio cache on (text + voice).
  function hashKey(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function clampRate(r) { r = Number(r) || 0.9; return Math.max(0.5, Math.min(2, r)); }

  // ── User feedback (Priority 6) — uses existing notification UI only ──
  // Messages resolve live from the fb.* locale keys (kinds: premium, fallback,
  // credits, serverOffline, invalidKey, rateLimit, offline, error), so voice
  // feedback follows the active language just like the rest of the UI.
  let premiumToastShown = false;
  function notePremiumActive() {
    if (premiumToastShown) return;
    premiumToastShown = true;
    showNotification(t('fb.premium'));
    announce(t('fb.premium'));
  }
  // Each distinct feedback event is surfaced at most once per reading session
  // (engine._feedbackShown is reset on every start()), so a long page can't
  // spam the same toast for every chunk.
  function emitFeedback(engine, kind) {
    if (!kind || !engine) return;
    const msg = t('fb.' + kind);
    if (msg === 'fb.' + kind) return;   // unknown kind → no matching locale key
    if (!engine._feedbackShown) engine._feedbackShown = {};
    if (engine._feedbackShown[kind]) return;
    engine._feedbackShown[kind] = true;
    showNotification(msg);
    announce(msg);
  }

  // Map backend/ElevenLabs HTTP status → user feedback + retry policy.
  function classifyHttpStatus(status) {
    switch (status) {
      case 401:
      case 403: return { feedback: 'invalidKey', retryable: false };
      case 402: return { feedback: 'credits', retryable: false };
      case 429: return { feedback: 'rateLimit', retryable: false };
      case 503: return { feedback: 'serverOffline', retryable: false };
      case 502:
      case 504: return { feedback: 'serverOffline', retryable: true };
      default:
        if (status >= 500) return { feedback: 'serverOffline', retryable: true };
        return { feedback: 'error', retryable: false };
    }
  }

  // ── LRU audio cache (premium MP3 object URLs) ───────────────
  // Map preserves insertion order → front = least-recently-used. Object URLs
  // are OWNED by this cache: revoked only on eviction / clearAudioCache(), so
  // a cached clip can be replayed any number of times with zero API calls.
  const audioCache = new Map();    // key -> objectUrl
  const pendingFetch = new Map();  // key -> Promise<objectUrl|null>

  function cacheGet(key) {
    if (!audioCache.has(key)) return null;
    const url = audioCache.get(key);
    audioCache.delete(key);
    audioCache.set(key, url);      // touch → most-recently-used
    return url;
  }
  function cacheSet(key, url) {
    if (!url) return;
    if (audioCache.has(key)) audioCache.delete(key);
    audioCache.set(key, url);
    while (audioCache.size > AUDIO_CACHE_MAX) {
      const oldestKey = audioCache.keys().next().value;
      const oldUrl = audioCache.get(oldestKey);
      audioCache.delete(oldestKey);
      try { URL.revokeObjectURL(oldUrl); } catch (_) {}
    }
  }
  function clearAudioCache() {
    audioCache.forEach(function (url) { try { URL.revokeObjectURL(url); } catch (_) {} });
    audioCache.clear();
    pendingFetch.clear();
  }

  // ── Premium circuit-breaker (credit protection) ─────────────
  // After a TERMINAL premium failure (credits exhausted / invalid key / rate
  // limit / hard server error), there is no point hammering the API again for
  // every remaining chunk — each call just burns a request and fails the same
  // way. blockPremium() latches premium OFF for the rest of the current read
  // AND for a short cooldown, so subsequent reads within that window skip the
  // backend entirely and go straight to the free browser voice. The latch
  // auto-expires so a genuine later attempt (e.g. credits topped up) can retry.
  const PREMIUM_COOLDOWN_MS = 60000;   // 1 min: don't re-probe a dead backend
  let premiumBlockedUntil = 0;
  function blockPremium() {
    premiumBlockedUntil = Date.now() + PREMIUM_COOLDOWN_MS;
    ttsEngine._premiumBlocked = true;
  }
  function premiumCurrentlyBlocked() {
    return Date.now() < premiumBlockedUntil;
  }

  // ── Providers ───────────────────────────────────────────────
  class VoiceProvider {
    speak(_text, _opts) { throw new Error('VoiceProvider.speak() not implemented'); }
    cancel() {}
    pause() {}
    resume() {}
    get available() { return false; }
  }

  class BrowserVoiceProvider extends VoiceProvider {
    // Build a configured utterance in the ACTIVE language (voice selection
    // lives here; the engine owns scheduling/onend so pause/resume/stop are
    // consistent). Picks the best-matching installed voice for that language.
    makeUtterance(text, opts) {
      const utt = new SpeechSynthesisUtterance(String(text));
      utt.rate = clampRate((opts && opts.rate) || state.speechRate || 0.9);
      utt.pitch = 1; utt.volume = 1;
      const tag = ttsLang();                 // e.g. 'pt-BR' | 'en-US' | 'es-ES'
      const base = tag.split('-')[0];        // 'pt' | 'en' | 'es'
      utt.lang = tag;
      const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      const match = voices.find(function (v) { return v.lang === tag; }) ||
                    voices.find(function (v) { return v.lang && v.lang.indexOf(base) === 0; }) ||
                    voices[0];
      if (match) utt.voice = match;
      return utt;
    }
    // Legacy single-shot speak — kept for backward compatibility.
    speak(text, opts) {
      if (!window.speechSynthesis || !text) return;
      window.speechSynthesis.cancel();
      const utt = this.makeUtterance(text, opts || {});
      state.speechUtterance = utt;
      window.speechSynthesis.speak(utt);
    }
    cancel() { if (window.speechSynthesis) window.speechSynthesis.cancel(); }
    pause()  { if (window.speechSynthesis) window.speechSynthesis.pause(); }
    resume() { if (window.speechSynthesis) window.speechSynthesis.resume(); }
    get available() { return !!window.speechSynthesis; }
  }

  class ElevenLabsVoiceProvider extends VoiceProvider {
    constructor(baseUrl) {
      super();
      this.baseUrl = (baseUrl || '').replace(/\/+$/, '');
    }
    // Cache key = hash(baseUrl + voice + language + text). Playback RATE is
    // applied client-side via audio.playbackRate and does NOT change the
    // synthesized bytes, so it is intentionally excluded — changing speed
    // never triggers a re-synthesis (cost win).
    cacheKey(text, opts) {
      const vid = (opts && opts.voiceId) || (config.voice && config.voice.voiceId) || 'default';
      // Language is part of the key so pt/en/es never collide in the cache.
      return 'el:' + hashKey(this.baseUrl + '|' + vid + '|' + ttsLang() + '|' + text);
    }
    // Returns an object URL for the synthesized MP3, or null to tell the
    // engine to fall back to the browser voice for this chunk. Retries up to
    // twice on transient (5xx / network) failures; classifies terminal errors
    // (401/402/403/429/503) and surfaces the matching pt-BR feedback.
    async synthesize(text, opts) {
      if (!this.baseUrl) return null;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        emitFeedback(ttsEngine, 'offline');
        return null;
      }
      const body = { text: String(text), language: ttsLang() };
      const vid = (opts && opts.voiceId) || (config.voice && config.voice.voiceId);
      if (vid) body.voice_id = vid;

      let attempt = 0;
      while (attempt <= 2) {
        try {
          const res = await fetch(this.baseUrl + '/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          if (res && res.ok) {
            const blob = await res.blob();
            return URL.createObjectURL(blob);
          }
          const cls = classifyHttpStatus(res ? res.status : 0);
          if (cls.retryable && attempt < 2) { attempt++; await delay(300 * attempt); continue; }
          emitFeedback(ttsEngine, cls.feedback);
          // Terminal error (credits/key/rate/hard-5xx): stop probing the API for
          // the rest of this read + a cooldown — every further call would only
          // waste another request and fail identically.
          blockPremium();
          return null;
        } catch (err) {
          if (attempt < 2) { attempt++; await delay(300 * attempt); continue; }
          emitFeedback(ttsEngine, 'serverOffline');
          blockPremium();          // backend unreachable → stop retrying premium
          return null;
        }
      }
      return null;
    }
    get available() { return !!this.baseUrl; }
  }

  // Provider registry + active selection.
  const providers = { browser: new BrowserVoiceProvider() };
  function activeProvider() {
    const want = (config.voice && config.voice.provider) || 'browser';
    const p = providers[want];
    // Fall back to the browser voice if the requested provider is missing or
    // unavailable. Runtime backend failures are handled inside the engine.
    return (p && p.available) ? p : providers.browser;
  }

  // ============================================================
  // FUTURE AI PROVIDERS — architecture only (not yet implemented).
  // Reserved hooks so OCR / image description / Whisper / text
  // simplification / translation can be added later through the
  // backend without refactoring the plugin.
  // ============================================================
  const aiProviders = {
    ocr: null,           // text extraction from images
    describe: null,      // AI image description (alt text)
    transcribe: null,    // Whisper speech-to-text
    simplify: null,      // plain-language text simplification
    translate: null,     // on-the-fly translation
  };

  // ============================================================
  // TTS ENGINE  (Speech) — explicit state machine + sequential queue.
  // States: IDLE → PLAYING ⇄ PAUSED → (STOPPED) → IDLE
  // ============================================================
  const ttsEngine = {
    state: 'IDLE',
    queue: [],
    index: 0,
    epoch: 0,            // bumped on stop()/start() to cancel stale async work
    audio: null,         // current premium HTMLAudioElement (if any)
    provider: null,
    opts: {},
    _sourceText: '',     // normalized text of the current read (request dedup)
    _lastStart: 0,       // debounce timestamp
    _lastNorm: '',       // last triggered text (text-aware debounce; survives stop)
    _chunkResolve: null, // resolves the in-flight chunk promise (stop unsticks)
    _usingBrowser: false,
    _feedbackShown: {},
    _premiumBlocked: false,   // circuit-breaker: skip premium for this read

    // Begin reading `text`. Normalizes + dedupes + chunks, then plays the
    // queue sequentially. Debounced and request-deduped to curb API spend.
    start: function (text, opts) {
      const provider = activeProvider();
      const norm = normalizeText(text);
      if (!norm) return;

      // Strong request-level dedup: same text already playing → ignore.
      if (this.state === 'PLAYING' && norm === this._sourceText) return;

      // Debounce — anti double-click ONLY. Swallow a repeat of the SAME text
      // fired within the window (e.g. a double-clicked button), but always let
      // a DIFFERENT text through so a newer read supersedes the old one rather
      // than being dropped (Priority 3: new request must win).
      const now = Date.now();
      if (norm === this._lastNorm && (now - this._lastStart) < TTS_DEBOUNCE_MS) return;
      this._lastStart = now;
      this._lastNorm = norm;

      this.stop(true);                 // cancel anything in flight (silent)
      this._sourceText = norm;
      this.queue = chunkText(norm, CHUNK_MAX);
      this.index = 0;
      this.provider = provider;
      this.opts = opts || {};
      this._feedbackShown = {};
      this._usingBrowser = false;
      // Respect the circuit-breaker cooldown: if a recent read hit a terminal
      // premium error, skip the backend entirely (free browser voice) until the
      // cooldown expires, instead of re-probing a known-dead API.
      this._premiumBlocked = premiumCurrentlyBlocked();
      if (this._premiumBlocked && provider && typeof provider.synthesize === 'function') {
        emitFeedback(this, 'fallback');
      }
      this.state = 'PLAYING';
      const epoch = ++this.epoch;
      this._drive(epoch);
    },

    // Sequential driver — one chunk at a time, no parallel fetches.
    _drive: async function (epoch) {
      while (this.index < this.queue.length) {
        if (epoch !== this.epoch) return;        // superseded / stopped
        const chunk = this.queue[this.index];
        try {
          await this._playChunk(chunk, epoch);
        } catch (_) {
          break;                                 // unrecoverable → abort read
        }
        if (epoch !== this.epoch) return;
        this.index++;
      }
      if (epoch === this.epoch) this._finish();
    },

    _playChunk: function (chunk, epoch) {
      const provider = this.provider;
      // Circuit-breaker engaged → never call the premium backend; use the free
      // browser voice for every remaining chunk of this read.
      if (this._premiumBlocked) {
        return this._playBrowserChunk(chunk, epoch);
      }
      if (provider && typeof provider.synthesize === 'function') {
        return this._playPremiumChunk(provider, chunk, epoch);
      }
      if (provider && typeof provider.speakChunk === 'function') {
        return provider.speakChunk(chunk, this.opts);     // custom queued provider
      }
      // Browser (Web Speech) path, and legacy speak()-only custom providers.
      if (provider === providers.browser || !provider || typeof provider.synthesize !== 'function') {
        if (provider && provider !== providers.browser && typeof provider.speak === 'function') {
          try { provider.speak(chunk, this.opts); } catch (_) {}
          return Promise.resolve();
        }
      }
      return this._playBrowserChunk(chunk, epoch);
    },

    // Premium chunk: cache → in-flight dedup → synthesize → cache → play.
    _playPremiumChunk: function (provider, chunk, epoch) {
      const self = this;
      const key = provider.cacheKey(chunk, this.opts);

      const cachedUrl = cacheGet(key);
      if (cachedUrl) { notePremiumActive(); return this._playUrl(cachedUrl, epoch); }

      // Reuse a pending identical request instead of issuing a duplicate one.
      let pending = pendingFetch.get(key);
      if (!pending) {
        pending = Promise.resolve()
          .then(function () { return provider.synthesize(chunk, self.opts); })
          .then(function (u) { return u; }, function () { return null; });
        pending.finally(function () { pendingFetch.delete(key); });
        pendingFetch.set(key, pending);
      }

      return pending.then(function (blobUrl) {
        // Always hand a synthesized URL to the cache — the cache is its sole
        // owner and revokes it on LRU eviction / clear. This both prevents a
        // leak when the read was superseded mid-fetch AND lets a future read of
        // the same text reuse it with zero API cost.
        if (blobUrl) cacheSet(key, blobUrl);
        if (epoch !== self.epoch) return;        // superseded after fetch → don't play
        if (!blobUrl) { emitFeedback(self, 'fallback'); return self._playBrowserChunk(chunk, epoch); }
        notePremiumActive();
        return self._playUrl(blobUrl, epoch);
      });
    },

    // Play a premium object URL; resolves when the clip ends, is stopped, or
    // errors (a single failed clip is skipped rather than aborting the read).
    _playUrl: function (url, epoch) {
      const self = this;
      return new Promise(function (resolve) {
        if (epoch !== self.epoch) { resolve(); return; }
        let settled = false;
        let audio = null;
        function finish() {
          if (settled) return;
          settled = true;
          if (self.audio === audio) self.audio = null;
          if (self._chunkResolve === finish) self._chunkResolve = null;
          resolve();
        }
        self._chunkResolve = finish;
        audio = new Audio(url);
        audio.playbackRate = clampRate((self.opts && self.opts.rate) || state.speechRate || 0.9);
        self.audio = audio;
        self._usingBrowser = false;
        audio.onended = finish;
        audio.onerror = finish;
        if (self.state === 'PAUSED') return;     // resume() will start it
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(function () { finish(); });
      });
    },

    // Browser (Web Speech) chunk; resolves on utterance end/error/stop.
    _playBrowserChunk: function (chunk, epoch) {
      const self = this;
      return new Promise(function (resolve) {
        if (epoch !== self.epoch || !chunk) { resolve(); return; }
        if (!window.speechSynthesis) { resolve(); return; }
        let settled = false;
        function finish() {
          if (settled) return;
          settled = true;
          if (self._chunkResolve === finish) self._chunkResolve = null;
          resolve();
        }
        self._chunkResolve = finish;
        window.speechSynthesis.cancel();
        const utt = providers.browser.makeUtterance(chunk, self.opts);
        utt.onend = finish;
        utt.onerror = finish;
        state.speechUtterance = utt;
        self._usingBrowser = true;
        window.speechSynthesis.speak(utt);
        if (self.state === 'PAUSED') { try { window.speechSynthesis.pause(); } catch (_) {} }
      });
    },

    pause: function () {
      if (this.state !== 'PLAYING') return;
      this.state = 'PAUSED';
      if (this.audio) { try { this.audio.pause(); } catch (_) {} }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        try { window.speechSynthesis.pause(); } catch (_) {}
      }
    },

    resume: function () {
      if (this.state !== 'PAUSED') return;
      this.state = 'PLAYING';
      if (this.audio) { const p = this.audio.play(); if (p && p.catch) p.catch(function () {}); }
      if (window.speechSynthesis) { try { window.speechSynthesis.resume(); } catch (_) {} }
    },

    // Immediate, total cancel. Bumps epoch (kills the driver loop + any
    // pending async), silences both audio paths, clears the queue.
    stop: function (silent) {
      this.epoch++;
      this.state = 'STOPPED';
      if (this.audio) {
        try { this.audio.pause(); } catch (_) {}
        this.audio.onended = this.audio.onerror = null;
        this.audio = null;
      }
      if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (_) {} }
      const r = this._chunkResolve; this._chunkResolve = null;
      if (r) { try { r(); } catch (_) {} }
      this.queue = [];
      this.index = 0;
      this._usingBrowser = false;
      this._sourceText = '';
      this.state = 'IDLE';
      if (!silent) notifyReadingStopped();
    },

    _finish: function () {
      this.state = 'IDLE';
      this.audio = null;
      this._usingBrowser = false;
      this._sourceText = '';
      notifyReadingStopped();
    },

    clearCache: clearAudioCache,
  };

  // Reset the "Ler página inteira" toggle when reading ends/stops so the
  // panel button reflects reality.
  function notifyReadingStopped() {
    if (isFeatureActive('read-page')) setFeatureActive('read-page', false);
  }

  // ============================================================
  // SPEECH SYNTHESIS  (Speech) — public entry points (unchanged names).
  // ============================================================
  function speakText(text) {
    if (!text) return;
    ttsEngine.start(text, {});
  }

  // Pick the most content-rich root so a page read synthesizes the ARTICLE,
  // not the nav/header/footer chrome — fewer characters = fewer premium chunks
  // = fewer ElevenLabs credits. Falls back to <body> when no landmark exists.
  function pickContentRoot() {
    const sels = ['main', '[role="main"]', 'article'];
    for (let i = 0; i < sels.length; i++) {
      const el = document.querySelector(sels[i]);
      if (el && (el.innerText || el.textContent || '').trim().length > 80) return el;
    }
    return document.body;
  }

  // Build the text to read aloud: scoped to main content, with the Help2See
  // widget, scripts/styles, hidden nodes, and (for whole-body reads) navigation
  // chrome removed. Cloned first so the live page is never mutated.
  function extractReadableText() {
    const root = pickContentRoot();
    if (!root) return '';
    const clone = root.cloneNode(true);
    clone.querySelectorAll(
      '#h2s-panel, #h2s-trigger, #h2s-notif, #h2s-voice-dot, #h2s-magnifier-lens, ' +
      '#h2s-mask-top, #h2s-mask-bottom, #h2s-reading-guide, script, style, noscript, ' +
      '[aria-hidden="true"], [hidden]'
    ).forEach(function (el) { el.remove(); });
    if (root === document.body) {
      clone.querySelectorAll(
        'nav, footer, aside, [role="navigation"], [role="contentinfo"]'
      ).forEach(function (el) { el.remove(); });
    }
    let text = (clone.innerText || clone.textContent || '').trim();
    // Safety net: never read nothing — fall back to the full body text.
    if (text.length < 40 && root !== document.body) {
      const b = document.body.cloneNode(true);
      b.querySelectorAll('#h2s-panel, #h2s-trigger, script, style, noscript')
        .forEach(function (el) { el.remove(); });
      text = (b.innerText || b.textContent || '').trim();
    }
    return text;
  }

  function readPage() {
    const text = extractReadableText();
    try { Analytics.track('voice_read_start', { chars: (text || '').length }); } catch (e) { /* telemetria opcional */ }
    ttsEngine.start(text, {});
  }

  function readSelectedText() {
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) {
      const txt = sel.toString().trim();
      try { Analytics.track('voice_read_start', { chars: txt.length, lang: ttsLang() }); } catch (e) { /* opcional */ }
      ttsEngine.start(txt, {});
    } else {
      showNotification(t('notif.selectText'));
    }
  }

  function stopReading()   { try { Analytics.track('voice_read_finish', null); } catch (e) { /* opcional */ } ttsEngine.stop(false); }
  function pauseReading()  { try { Analytics.track('settings_changed', { setting: 'tts_state', value: 'pause' }); } catch (e) {} ttsEngine.pause(); }
  function resumeReading() { try { Analytics.track('settings_changed', { setting: 'tts_state', value: 'resume' }); } catch (e) {} ttsEngine.resume(); }

  // ============================================================
  // VOICE NAVIGATION  (Speech)
  // ============================================================
  function startVoiceNavigation() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      showNotification(t('notif.voiceUnsupported'));
      setFeatureActive('voice-nav', false);
      return;
    }
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = false;
    // Recognize in the active language; the grammar also carries PT/EN/ES
    // synonyms so commands still match across minor language mismatches.
    rec.lang = ttsLang();

    rec.onresult = (e) => {
      const cmd = e.results[e.results.length - 1][0].transcript.toLowerCase().trim();
      handleVoiceCommand(cmd);
    };
    rec.onerror = () => {
      showNotification(t('notif.voiceError'));
      setFeatureActive('voice-nav', false);
    };

    try { rec.start(); } catch (err) {}
    state.voiceRecognition = rec;
    try { Analytics.track('settings_changed', { setting: 'voice_nav', value: true }); } catch (e) { /* opcional */ }

    if (!document.getElementById('h2s-voice-dot')) {
      const dot = document.createElement('div');
      dot.className = 'h2s-voice-active-dot';
      dot.id = 'h2s-voice-dot';
      dot.setAttribute('aria-hidden', 'true');
      document.body.appendChild(dot);
    }
    showNotification('🎤 ' + t('notif.voiceActive'));
  }

  function stopVoiceNavigation() {
    if (state.voiceRecognition) {
      try { state.voiceRecognition.stop(); } catch (e) {}
      state.voiceRecognition = null;
      try { Analytics.track('settings_changed', { setting: 'voice_nav', value: false }); } catch (e) { /* opcional */ }
    }
    const dot = document.getElementById('h2s-voice-dot');
    if (dot) dot.remove();
  }

  // Voice command grammar — MULTILINGUAL (pt / en / es synonyms per command).
  // Each entry: { match: [phrases...], run: fn }. First match wins, so explicit
  // enable/disable phrases are listed BEFORE the bare toggle for the same
  // feature. Word order is irrelevant — matching is partial + fuzzy and
  // accent/punctuation/case-insensitive (see normalizeCommand) — so "menu
  // abrir", "abrir menu" and "abrir el menú" all resolve to the same action.
  // Explicit ON/OFF helpers backing the "enable/disable X" voice commands.
  // Idempotent: only acts when the current state differs from the request, so
  // "disable contrast" when contrast is already off is a harmless no-op.
  function setFeatureOn(id, on) {
    if (isFeatureActive(id) === !!on) return;
    toggleFeature(id);
  }
  function setProfileOn(id, on) {
    const active = state.activeProfile === id;
    if (on && !active) applyProfile(id);      // applyProfile enables when inactive
    else if (!on && active) clearProfile();
  }

  const VOICE_COMMANDS = [
    { match: ['abrir menu', 'open menu', 'menu', 'abrir menú', 'abrir el menu'], run: () => openPanel() },
    { match: ['fechar menu', 'close menu', 'cerrar menú', 'cerrar el menu'], run: () => closePanel() },
    { match: ['ler página', 'ler pagina', 'read page', 'leer página', 'leer pagina'], run: () => readPage() },
    { match: ['ler seleção', 'ler selecao', 'read selection', 'leer selección', 'leer seleccion'], run: () => readSelectedText() },
    { match: ['parar leitura', 'parar', 'stop reading', 'stop', 'detener lectura', 'detener', 'parar lectura'], run: () => stopReading() },
    { match: ['pausar leitura', 'pausar', 'pause reading', 'pause', 'pausar lectura'], run: () => pauseReading() },
    { match: ['continuar leitura', 'continuar', 'retomar', 'resume reading', 'resume', 'reanudar lectura', 'reanudar', 'continuar lectura'], run: () => resumeReading() },
    { match: ['aumentar fonte', 'zoom in', 'increase font', 'aumentar fuente', 'aumentar texto'], run: () => applyTextScale(Math.min(TEXT_SCALE_MAX, state.textScaleFactor + 0.1)) },
    { match: ['diminuir fonte', 'zoom out', 'decrease font', 'disminuir fuente', 'reducir fuente', 'reducir texto'], run: () => applyTextScale(Math.max(TEXT_SCALE_MIN, state.textScaleFactor - 0.1)) },
    { match: ['restaurar fonte', 'redefinir fonte', 'fonte padrao', 'tamanho padrao', 'restaurar texto', 'restore text', 'reset text size', 'default text size', 'restaurar fuente', 'texto normal', 'tamano normal'], run: () => applyTextScale(1) },
    // Contrast — explicit enable/disable before the toggle entry.
    { match: ['desativar contraste', 'desligar contraste', 'disable contrast', 'turn off contrast', 'desactivar contraste', 'quitar contraste'], run: () => setFeatureOn('high-contrast', false) },
    { match: ['ativar contraste', 'ligar contraste', 'enable contrast', 'turn on contrast', 'activar contraste'], run: () => setFeatureOn('high-contrast', true) },
    { match: ['alto contraste', 'high contrast'],    run: () => toggleFeature('high-contrast') },
    // Invert colors — explicit OFF must come BEFORE the toggle entry so a phrase
    // like "desativar inversão de cores" turns it off instead of toggling it.
    { match: ['desativar inversao de cores', 'desativar cores invertidas', 'desligar inversao', 'desligar cores invertidas', 'remover inversao', 'tirar inversao', 'desativar inversao', 'cores normais', 'turn off invert', 'disable invert colors', 'disable invert', 'desactivar colores invertidos', 'quitar inversion', 'colores normales'], run: () => setInvertColors(false) },
    { match: ['ativar cores invertidas', 'ativar inversao de cores', 'ligar inversao', 'enable invert colors', 'enable invert', 'turn on invert', 'activar colores invertidos'], run: () => setInvertColors(true) },
    { match: ['inverter cores', 'modo negativo', 'inverter tela', 'cores invertidas', 'inversao de cores', 'modo invertido', 'inverter', 'invert colors', 'negative mode', 'invertir colores', 'colores invertidos'], run: () => toggleInvertColors() },
    // Magnifier — explicit enable/disable before the bare "lupa" toggle.
    { match: ['desativar lupa', 'desligar lupa', 'fechar lupa', 'disable magnifier', 'turn off magnifier', 'desactivar lupa', 'cerrar lupa'], run: () => setFeatureOn('magnifier', false) },
    { match: ['ativar lupa', 'ligar lupa', 'abrir lupa', 'enable magnifier', 'turn on magnifier', 'activar lupa'], run: () => setFeatureOn('magnifier', true) },
    { match: ['lupa', 'ampliar', 'magnifier'],       run: () => toggleFeature('magnifier') },
    { match: ['preto e branco', 'escala de cinza', 'grayscale', 'black and white', 'escala de grises', 'blanco y negro'], run: () => toggleFeature('monochrome') },
    { match: ['destacar links', 'highlight links', 'resaltar enlaces'], run: () => toggleFeature('highlight-links') },
    // Accessibility profiles — explicit enable/disable before the toggles.
    { match: ['desativar modo autismo', 'desativar autismo', 'desligar autismo', 'disable autism', 'turn off autism', 'desactivar autismo'], run: () => setProfileOn('autism', false) },
    { match: ['ativar modo autismo', 'ativar autismo', 'ligar autismo', 'enable autism', 'turn on autism', 'activar autismo'], run: () => setProfileOn('autism', true) },
    { match: ['perfil autismo', 'autismo', 'autism'], run: () => applyProfile('autism') },
    { match: ['desativar modo tdah', 'desativar tdah', 'desligar tdah', 'disable adhd', 'turn off adhd', 'desactivar tdah'], run: () => setProfileOn('adhd', false) },
    { match: ['ativar modo tdah', 'ativar tdah', 'ligar tdah', 'enable adhd', 'turn on adhd', 'activar tdah'], run: () => setProfileOn('adhd', true) },
    { match: ['perfil tdah', 'tdah', 'adhd'],        run: () => applyProfile('adhd') },
    { match: ['desativar baixa visao', 'desligar baixa visao', 'disable low vision', 'turn off low vision', 'desactivar baja vision'], run: () => setProfileOn('low-vision', false) },
    { match: ['ativar baixa visao', 'ligar baixa visao', 'enable low vision', 'turn on low vision', 'activar baja vision'], run: () => setProfileOn('low-vision', true) },
    { match: ['perfil baixa visão', 'baixa visao', 'low vision', 'baja vision', 'perfil baja vision'], run: () => applyProfile('low-vision') },
    { match: ['rolar para cima', 'scroll up', 'desplazar arriba', 'subir'], run: () => window.scrollBy({ top: -300, behavior: 'smooth' }) },
    { match: ['rolar para baixo', 'scroll down', 'desplazar abajo', 'bajar'], run: () => window.scrollBy({ top: 300, behavior: 'smooth' }) },
    { match: ['reiniciar configurações', 'reiniciar configuracoes', 'reset', 'restablecer configuracion', 'reiniciar ajustes'], run: () => reset() },
    { match: ['voltar', 'go back', 'volver', 'atras'], run: () => history.back() },
    { match: ['avançar', 'avancar', 'go forward', 'avanzar', 'adelante'], run: () => history.forward() },
  ];

  // Filler / politeness / modal words that carry no intent. Stripping them lets
  // natural phrases ("pode abrir o menu por favor", "quero parar a leitura
  // agora") resolve to the same action as the bare command. The list is
  // deliberately conservative: it excludes any token that appears inside a real
  // command phrase (e.g. "para" in "rolar para cima", "e" in "preto e branco"),
  // so stripping can never corrupt a valid command.
  const FILLER_WORDS = {
    // pt
    por: 1, favor: 1, agora: 1, ai: 1, pra: 1, mim: 1, pode: 1, poderia: 1,
    podia: 1, quero: 1, queria: 1, gostaria: 1, isso: 1, isto: 1, me: 1,
    voce: 1, vc: 1, entao: 1, ne: 1, eh: 1, hum: 1, obrigado: 1, obrigada: 1,
    aqui: 1, ali: 1,
    // en
    please: 1, now: 1,
    // es (only tokens that never appear inside a command phrase — no "de"/"y")
    ahora: 1, quiero: 1, quisiera: 1, puedes: 1, puede: 1, podrias: 1,
    gustaria: 1, gracias: 1, hola: 1
  };

  // Normalize a phrase for tolerant matching: lowercase, strip diacritics,
  // drop punctuation, collapse whitespace, then remove filler words.
  // "Pode abrir o Menu, por favor!" → "abrir o menu" → "abrir menu".
  function normalizeCommand(s) {
    const base = String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!base) return base;
    const kept = base.split(' ').filter(w => !FILLER_WORDS[w]);
    // If stripping removed everything (user said only filler), keep the original
    // so we never lose a borderline command.
    return kept.length ? kept.join(' ') : base;
  }

  // Levenshtein edit distance (small inputs only) — backs the fuzzy fallback.
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[n];
  }

  // Fuzzy phrase test: every word of the target appears in the spoken text
  // exactly, as a sub-string, or within a length-scaled edit distance. This
  // absorbs ASR slips ("abri menu" → "abrir menu") without false positives.
  function fuzzyPhraseMatch(spokenWords, phrase) {
    const target = phrase.split(' ').filter(Boolean);
    if (!target.length) return false;
    return target.every(function (tw) {
      const tol = tw.length <= 4 ? 1 : 2;
      return spokenWords.some(function (sw) {
        if (sw === tw || sw.indexOf(tw) !== -1 || tw.indexOf(sw) !== -1) return true;
        return levenshtein(sw, tw) <= tol;
      });
    });
  }

  // Intelligent command resolution (Priority 3): normalize → partial match →
  // fuzzy fallback. Synonyms live in each command's `match` list.
  function handleVoiceCommand(rawCmd) {
    showNotification(`🎤 "${rawCmd}"`);
    const cmd = normalizeCommand(rawCmd);
    if (!cmd) return;
    const words = cmd.split(' ');

    // Pass 1 — partial (substring) match on normalized phrases.
    for (const entry of VOICE_COMMANDS) {
      if (entry.match.some(m => cmd.indexOf(normalizeCommand(m)) !== -1)) { trackVoiceCommand(entry); entry.run(); return; }
    }
    // Pass 2 — fuzzy fallback for minor recognition/spelling slips.
    for (const entry of VOICE_COMMANDS) {
      if (entry.match.some(m => fuzzyPhraseMatch(words, normalizeCommand(m)))) { trackVoiceCommand(entry); entry.run(); return; }
    }
  }

  // Telemetria: registra qual comando de voz foi reconhecido. Usa a primeira
  // frase canônica (pt-BR) do comando como rótulo escalar — nunca o áudio bruto.
  function trackVoiceCommand(entry) {
    try {
      Analytics.track('settings_changed', { setting: 'voice_command', value: entry.match[0] });
    } catch (e) { /* telemetria opcional */ }
  }

  // ============================================================
  // PROFILES  (Profiles)
  // ============================================================
  function applyProfile(profileId) {
    const profile = PROFILES.find(p => p.id === profileId);
    if (!profile) return;

    // Toggling the active profile off.
    if (state.activeProfile === profileId) {
      clearProfile();
      return;
    }

    clearProfile(false);
    state.activeProfile = profileId;
    try { Analytics.track('settings_changed', { setting: 'profile', value: profileId }); } catch (e) { /* opcional */ }
    profile.features.forEach(f => {
      setFeatureActive(f, true);
      applyFeature(f, true);
    });
    savePrefs();
    const pname = t('profile.' + profileId);
    showNotification('✅ ' + t('notif.profileEnabled', { name: pname }));
    announce(t('notif.profileEnabled', { name: pname }));

    document.querySelectorAll('[data-profile]').forEach(btn => {
      const on = btn.dataset.profile === profileId;
      btn.classList.toggle('h2s-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function clearProfile(showMsg = true) {
    if (state.activeProfile) {
      const profile = PROFILES.find(p => p.id === state.activeProfile);
      if (profile) {
        profile.features.forEach(f => {
          setFeatureActive(f, false);
          applyFeature(f, false);
        });
      }
    }
    state.activeProfile = null;
    document.querySelectorAll('[data-profile]').forEach(btn => {
      btn.classList.remove('h2s-active');
      btn.setAttribute('aria-pressed', 'false');
    });
    savePrefs();
    if (showMsg) showNotification(t('notif.profileRemoved'));
  }

  // ============================================================
  // SHARED DOM HELPER  (UI) — used by headings nav, effects, readers.
  // ============================================================
  function isInWidget(el) {
    return el.closest && (el.closest('#h2s-panel') || el.closest('#h2s-trigger') || el.closest('#h2s-magnifier-lens'));
  }

  // ============================================================
  // HEADINGS NAVIGATOR  (UI) — delegated, no inline handlers.
  // ============================================================
  function pageHeadings() {
    return Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(h => !isInWidget(h));
  }

  function buildHeadingsList() {
    const headings = pageHeadings();
    if (!headings.length) return '<p style="color:var(--h2s-text-muted);padding:8px">' + escapeHtml(t('notif.headingsNone')) + '</p>';
    return headings.map((h, i) => {
      const level = parseInt(h.tagName.charAt(1), 10);
      const indent = (level - 1) * 12;
      const text = (h.textContent ? h.textContent.trim().substring(0, 50) : '') || `Heading ${i + 1}`;
      return `<button type="button" class="h2s-heading-item" data-h2s-heading="${i}" style="padding-left:${8 + indent}px"><strong>H${level}</strong> ${escapeHtml(text)}</button>`;
    }).join('');
  }

  function toggleHeadingsList() {
    const listEl = document.getElementById('h2s-headings-list');
    const btn = document.getElementById('h2s-headings-nav');
    if (!listEl) return;
    state.headingsOpen = !state.headingsOpen;
    if (state.headingsOpen) {
      listEl.innerHTML = buildHeadingsList();
      listEl.style.display = 'block';
    } else {
      listEl.style.display = 'none';
    }
    if (btn) btn.setAttribute('aria-expanded', String(state.headingsOpen));
  }

  // ============================================================
  // THEME  (UI)
  // ============================================================
  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.setAttribute('data-h2s-theme', 'dark');
    } else if (theme === 'light') {
      html.removeAttribute('data-h2s-theme');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) html.setAttribute('data-h2s-theme', 'dark');
      else html.removeAttribute('data-h2s-theme');
    }
    state.theme = theme;
  }

  function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-h2s-theme') === 'dark';
    if (isDark) { html.removeAttribute('data-h2s-theme'); state.theme = 'light'; }
    else { html.setAttribute('data-h2s-theme', 'dark'); state.theme = 'dark'; }
  }

  // ============================================================
  // POSITION  (UI)
  // ============================================================
  function setPosition(pos) {
    const trigger = document.getElementById(TRIGGER_ID);
    const panel = document.getElementById(PANEL_ID);
    const posClasses = ['h2s-pos-br', 'h2s-pos-bl', 'h2s-pos-tr', 'h2s-pos-tl'];
    const map = {
      'bottom-right': 'h2s-pos-br', 'bottom-left': 'h2s-pos-bl',
      'top-right': 'h2s-pos-tr', 'top-left': 'h2s-pos-tl'
    };
    const cls = map[pos] || 'h2s-pos-br';
    if (trigger) { posClasses.forEach(c => trigger.classList.remove(c)); trigger.classList.add(cls); }
    if (panel) { posClasses.forEach(c => panel.classList.remove(c)); panel.classList.add(cls); }
  }

  // ============================================================
  // DRAGGABLE TRIGGER  (UI) — document listeners only while dragging.
  // ============================================================
  let _dragMoved = false;
  function trigger_wasDragged() {
    const moved = _dragMoved;
    _dragMoved = false;
    return moved;
  }

  function makeDraggable() {
    const trigger = document.getElementById(TRIGGER_ID);
    if (!trigger) return;
    let dragging = false, startX, startY, startLeft, startTop;

    function onMove(e) {
      if (!dragging) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) _dragMoved = true;
      const size = trigger.offsetWidth || 64;
      const newLeft = Math.max(0, Math.min(window.innerWidth - size, startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - size, startTop + dy));
      trigger.style.left = newLeft + 'px';
      trigger.style.top = newTop + 'px';
      trigger.style.right = 'auto';
      trigger.style.bottom = 'auto';
      if (e.cancelable) e.preventDefault();
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      trigger.style.transition = '';
      removeDocListener('dragMoveM'); removeDocListener('dragMoveT');
      removeDocListener('dragUpM'); removeDocListener('dragUpT');
    }
    function onDown(e) {
      const touch = e.touches ? e.touches[0] : e;
      dragging = true;
      _dragMoved = false;
      startX = touch.clientX; startY = touch.clientY;
      const rect = trigger.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      trigger.style.transition = 'none';
      addDocListener('dragMoveM', 'mousemove', onMove);
      addDocListener('dragMoveT', 'touchmove', onMove, { passive: false });
      addDocListener('dragUpM', 'mouseup', onUp);
      addDocListener('dragUpT', 'touchend', onUp);
      if (e.cancelable) e.preventDefault();
    }

    trigger.addEventListener('mousedown', onDown);
    trigger.addEventListener('touchstart', onDown, { passive: false });
  }

  // ============================================================
  // NOTIFICATION TOAST  (UI)
  // ============================================================
  let notifTimeout;
  function showNotification(msg) {
    let notif = document.getElementById('h2s-notif');
    if (!notif) {
      notif = document.createElement('div');
      notif.id = 'h2s-notif';
      notif.className = 'h2s-notification';
      notif.setAttribute('role', 'status');
      notif.setAttribute('aria-live', 'polite');
      document.body.appendChild(notif);
    }
    notif.textContent = msg;
    notif.classList.add('h2s-show');
    clearTimeout(notifTimeout);
    notifTimeout = setTimeout(() => notif.classList.remove('h2s-show'), 2800);
  }

  // ============================================================
  // KEYBOARD SHORTCUT  (UI)
  // ============================================================
  // Resolve a KeyboardEvent.code (PHYSICAL key, layout-independent) to the
  // logical character our shortcut maps use. Because it reads the physical
  // position, the same combo fires on ABNT2, US, AZERTY, etc. — exactly what
  // the accessibility shortcut system needs. Returns '' for codes we ignore.
  function codeToChar(code) {
    if (!code) return '';
    if (code.indexOf('Key') === 0) return code.slice(3).toLowerCase();          // KeyM → 'm'
    if (code.indexOf('Digit') === 0) return code.slice(5);                      // Digit0 → '0'
    if (code.indexOf('Numpad') === 0) {
      const rest = code.slice(6);
      if (/^[0-9]$/.test(rest)) return rest;                                    // Numpad0 → '0'
      if (rest === 'Add') return '+';
      if (rest === 'Subtract') return '-';
      return '';
    }
    if (code === 'Equal') return '+';                                           // '='/'+' key
    if (code === 'Minus') return '-';                                           // '-'/'_' key
    return '';
  }

  function onGlobalKeydown(e) {
    // Legacy toggle (kept for backward compatibility): Ctrl/⌘+U. Uses the
    // physical KeyU code so the layout can never shift the binding.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyU') {
      e.preventDefault();
      state.panelOpen ? closePanel() : openPanel();
      return;
    }

    // ── PRIORITY 2 — Ctrl+Alt+<key> global shortcuts (event.code based) ──
    // The full production shortcut set. Checked before the legacy Alt-only
    // branch; because these require BOTH Ctrl and Alt they can never collide
    // with the Alt-only legacy combos below. Dispatched on the PHYSICAL key so
    // the bindings are identical on every keyboard layout (ABNT2, US, …).
    if (e.altKey && (e.ctrlKey || e.metaKey)) {
      if (runCtrlAltShortcut(codeToChar(e.code))) {
        try { Analytics.track('shortcut_used', { keys: 'ctrl+alt+' + codeToChar(e.code) }); } catch (e2) { /* opcional */ }
        e.preventDefault(); return;
      }
    }

    // ── Legacy Help2See shortcuts (Alt + key, no Ctrl) ──
    // Single source of truth, dispatched from the one global listener so we
    // never register duplicate handlers. Also resolved via event.code so the
    // legacy combos stay reliable across layouts. We only claim Alt-combos and
    // never intercept typing inside form fields.
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const target = e.target;
      const typing = target && (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) { if (state.panelOpen) handleFocusTrap(e); return; }

      const handled = runShortcut(codeToChar(e.code));
      if (handled) {
        try { Analytics.track('shortcut_used', { keys: 'alt+' + codeToChar(e.code) }); } catch (e2) { /* opcional */ }
        e.preventDefault(); return;
      }
    }

    // ── ESC — close menus / overlays / exit navigation mode (Priority 5) ──
    if (e.code === 'Escape' || e.key === 'Escape') {
      if (handleEscape()) { e.preventDefault(); return; }
    }

    // ── PRIORITY 5 — single-key accessibility navigation (H/P/B/L/I/F) ──
    // Deliberately gated behind "panel is open" + no modifier + not typing, so
    // ordinary page typing and host-site single-key shortcuts are never
    // hijacked. Once the user opens the Help2See menu these become live. Also
    // resolved through event.code so it is layout-independent.
    if (state.panelOpen && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      const target = e.target;
      const typing = target && (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' ||
        target.isContentEditable);
      if (!typing && runNavKey(codeToChar(e.code))) { e.preventDefault(); return; }
    }

    if (state.panelOpen) handleFocusTrap(e);
  }

  // PRIORITY 2 — map a Ctrl+Alt+<char> (resolved from event.code) to its
  // action. Returns true if handled. The full production shortcut map.
  function runCtrlAltShortcut(key) {
    switch (key) {
      case 'm': state.panelOpen ? closePanel() : openPanel();   return true; // menu
      case 's': readSelectedText();                             return true; // ler seleção
      case 'l': readPage();                                     return true; // ler página
      case 'p': pauseReading();                                 return true; // pausar
      case 'r': resumeReading();                                return true; // retomar
      case 'x': stopReading();                                  return true; // parar
      case 'z': toggleFeature('magnifier');                     return true; // lupa
      case 'c': toggleFeature('high-contrast');                 return true; // contraste
      case 'v': toggleInvertColors();                           return true; // inverter cores
      case 'a': applyProfile('autism');                         return true; // perfil autismo
      case 't': applyProfile('adhd');                           return true; // perfil ADHD
      case 'b': applyProfile('low-vision');                     return true; // perfil baixa visão
      case '0': applyTextScale(1);                              return true; // fonte padrão
      case '+':
        applyTextScale(Math.min(TEXT_SCALE_MAX, state.textScaleFactor + 0.1)); return true;
      case '-':
        applyTextScale(Math.max(TEXT_SCALE_MIN, state.textScaleFactor - 0.1)); return true;
      default:
        return false;
    }
  }

  // Map a legacy Alt+<key> press to an action. Returns true if it matched.
  function runShortcut(key) {
    switch (key) {
      case 'h': case 'H':            // Alt+H → abrir/fechar menu
        state.panelOpen ? closePanel() : openPanel(); return true;
      case 'l': case 'L':            // Alt+L → ler página
        readPage(); return true;
      case 'p': case 'P':            // Alt+P → parar leitura
        stopReading(); return true;
      case 'c': case 'C':            // Alt+C → alto contraste
        toggleFeature('high-contrast'); return true;
      case 'g': case 'G':            // Alt+G → escala de cinza (monochrome)
        toggleFeature('monochrome'); return true;
      case 'e': case 'E':            // Alt+E → espaçamento do texto
        toggleFeature('text-spacing-light'); return true;
      case '+': case '=':            // Alt + + → aumentar fonte
        applyTextScale(Math.min(TEXT_SCALE_MAX, state.textScaleFactor + 0.1)); return true;
      case '-': case '_':            // Alt + - → diminuir fonte
        applyTextScale(Math.max(TEXT_SCALE_MIN, state.textScaleFactor - 0.1)); return true;
      default:
        return false;
    }
  }

  // ESC handler — implements the full ESC rule: stop contextual reading, exit
  // navigation mode, close the most intrusive open layer (one per press), and
  // return to a neutral state.
  function handleEscape() {
    // Stop any contextual spoken feedback and exit navigation mode first.
    const silenced = cancelFeedback();
    resetNavCursors();

    if (state.panelOpen)                    { closePanel();                 return true; }
    if (isFeatureActive('magnifier'))       { toggleFeature('magnifier');   return true; }
    if (isFeatureActive('voice-nav'))       { stopVoiceNavigation(); setFeatureActive('voice-nav', false); return true; }
    if (isFeatureActive('reading-mask'))    { toggleFeature('reading-mask'); return true; }
    if (isFeatureActive('reading-guide'))   { toggleFeature('reading-guide'); return true; }
    if (isFeatureActive('focus-highlight')) { toggleFeature('focus-highlight'); return true; }
    if (ttsEngine.state === 'PLAYING' || ttsEngine.state === 'PAUSED') { stopReading(); return true; }
    // If nothing else was open but we silenced feedback, consume the key too.
    return silenced;
  }

  // ── PRIORITY 5 — single-key element navigation ──────────────
  const NAV_SELECTORS = {
    h: 'h1,h2,h3,h4,h5,h6',
    p: 'p',
    b: 'button,[role="button"],input[type="button"],input[type="submit"],input[type="reset"]',
    l: 'a[href]',
    i: 'img',
    f: 'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]),textarea,select',
  };
  // Localized noun for each navigable element type (resolved live via t()).
  const NAV_LABEL_KEYS = { h: 'desc.heading', p: 'desc.paragraph', b: 'desc.button', l: 'desc.link', i: 'desc.image', f: 'desc.field' };
  function navLabel(type) { return t(NAV_LABEL_KEYS[type] || 'desc.element'); }
  const navCursor = {};   // type -> last visited index (wraps around)

  function navElements(type) {
    const sel = NAV_SELECTORS[type];
    if (!sel) return [];
    return Array.from(document.querySelectorAll(sel)).filter(function (el) {
      if (isInWidget(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const cs = window.getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    });
  }

  function focusNavTarget(el) {
    try {
      if (!el.hasAttribute('tabindex') &&
          !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
        el.setAttribute('tabindex', '-1');
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    } catch (_) {}
  }

  // Resolve a human-friendly accessible name for a navigated element, in the
  // order assistive tech would: aria-label → aria-labelledby → associated
  // <label> → alt/title/placeholder/value → visible text.
  function navAccessibleName(el) {
    if (!el) return '';
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();

    const labelledby = el.getAttribute && el.getAttribute('aria-labelledby');
    if (labelledby) {
      const txt = labelledby.split(/\s+/)
        .map(id => { const n = document.getElementById(id); return n ? n.textContent : ''; })
        .join(' ').replace(/\s+/g, ' ').trim();
      if (txt) return txt;
    }
    // Associated <label> for form fields.
    if (el.id) {
      const lab = document.querySelector('label[for="' + ((window.CSS && window.CSS.escape) ? window.CSS.escape(el.id) : el.id) + '"]');
      if (lab && lab.textContent.trim()) return lab.textContent.replace(/\s+/g, ' ').trim();
    }
    if (el.closest) {
      const wrap = el.closest('label');
      if (wrap && wrap.textContent.trim()) return wrap.textContent.replace(/\s+/g, ' ').trim();
    }
    if (el.tagName === 'IMG') {
      const alt = el.getAttribute('alt');
      if (alt != null && alt.trim()) return alt.trim();
    }
    const title = el.getAttribute && el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    if ('value' in el && el.value && (el.tagName === 'INPUT' || el.tagName === 'BUTTON')) {
      // For push buttons the value is the visible caption.
      const t = (el.getAttribute && el.getAttribute('type')) || '';
      if (/^(button|submit|reset)$/i.test(t) || el.tagName === 'BUTTON') return String(el.value).trim();
    }
    const ph = el.getAttribute && el.getAttribute('placeholder');
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
    if (ph && ph.trim()) return ph.trim();
    return '';
  }

  // Localized name for a form-field type (announced for F navigation). Resolves
  // from the field.* keys; an unknown/exotic type falls back to the raw token.
  function fieldTypeLabel(el) {
    if (el.tagName === 'TEXTAREA') return t('field.textarea');
    if (el.tagName === 'SELECT') return t('field.select');
    const ty = ((el.getAttribute && el.getAttribute('type')) || 'text').toLowerCase();
    const label = t('field.' + ty);
    return label === 'field.' + ty ? ty : label;   // t() returns the key when missing
  }

  // Build the element-type-aware spoken description in the ACTIVE language.
  // Examples (pt): "Título nível 2: Configurações"  "Botão: Enviar"
  //           (en): "Link: Privacy policy, opens in a new tab"
  // Announces level, pressed/expanded/disabled state, new-tab links, required
  // fields, field type, and checkbox/radio checked state (WCAG-oriented).
  function describeNavElement(type, el) {
    const name = navAccessibleName(el);
    switch (type) {
      case 'h': {
        const lvl = el.getAttribute('aria-level') ||
          (/^H([1-6])$/.test(el.tagName) ? el.tagName.charAt(1) : '');
        return t('desc.heading') + (lvl ? ' ' + t('desc.level') + ' ' + lvl : '') + (name ? ': ' + name : '');
      }
      case 'p': {
        // Paragraphs are auto-read: speak the actual content (capped so a long
        // block does not produce an unwieldy utterance).
        const txt = name.length > 320 ? name.slice(0, 320).trim() + '…' : name;
        return txt ? t('desc.paragraph') + ': ' + txt : t('desc.emptyParagraph');
      }
      case 'b': {
        let s = t('desc.button') + (name ? ': ' + name : ' ' + t('desc.unlabeled'));
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') s += ', ' + t('desc.disabled');
        else if (el.getAttribute('aria-pressed') === 'true') s += ', ' + t('desc.pressed');
        else if (el.getAttribute('aria-expanded') === 'true') s += ', ' + t('desc.expanded');
        return s;
      }
      case 'l': {
        let s = t('desc.link') + (name ? ': ' + name : ' ' + t('desc.noText'));
        if (el.getAttribute('target') === '_blank') s += ', ' + t('desc.newTab');
        return s;
      }
      case 'i': {
        return name ? t('desc.image') + ': ' + name : t('desc.imageNoAlt');
      }
      case 'f': {
        let s = t('desc.field') + (name ? ': ' + name : ' ' + t('desc.unlabeled')) + ', ' + t('desc.type') + ' ' + fieldTypeLabel(el);
        const inputType = ((el.getAttribute && el.getAttribute('type')) || '').toLowerCase();
        if (inputType === 'checkbox' || inputType === 'radio') {
          s += ', ' + (el.checked ? t('desc.checked') : t('desc.unchecked'));
        }
        if (el.required || el.getAttribute('aria-required') === 'true') s += ', ' + t('desc.required');
        if (el.disabled) s += ', ' + t('desc.disabled');
        return s;
      }
      default:
        return navLabel(type) + (name ? ': ' + name : '');
    }
  }

  // Jump to the next element of the requested type. Returns true if the key
  // mapped to a navigation type (handled), false otherwise. Every jump now
  // SPEAKS an element-type-aware description plus its position in the set.
  function runNavKey(key) {
    const k = (key || '').toLowerCase();
    if (!NAV_SELECTORS[k]) return false;
    const els = navElements(k);
    if (!els.length) {
      speakFeedback(t('desc.noneFound', { type: navLabel(k).toLowerCase() }));
      return true;
    }
    const next = (navCursor[k] == null) ? 0 : (navCursor[k] + 1) % els.length;
    navCursor[k] = next;
    const el = els[next];
    focusNavTarget(el);
    const desc = describeNavElement(k, el);
    speakFeedback(desc + ' ' + t('desc.position', { n: next + 1, total: els.length }));
    return true;
  }

  // Reset the navigation cursors so the next H/P/B/L/I/F press starts fresh.
  function resetNavCursors() {
    Object.keys(navCursor).forEach(key => { delete navCursor[key]; });
  }

  function bindKeyboard() {
    addDocListener('globalKeydown', 'keydown', onGlobalKeydown);
  }

  // ============================================================
  // RESTORE / RESET  (Features)
  // ============================================================
  function restorePrefs() {
    if (state.activeProfile) {
      const profile = PROFILES.find(p => p.id === state.activeProfile);
      if (profile) profile.features.forEach(f => { if (isFeatureActive(f)) applyFeature(f, true); });
    }
    Object.keys(state.activeFeatures).forEach(id => {
      if (state.activeFeatures[id]) applyFeature(id, true);
    });
    if (state.textScaleFactor && state.textScaleFactor !== 1) applyTextScale(state.textScaleFactor, true);
  }

  function reset() {
    Object.keys(state.activeFeatures).forEach(id => applyFeature(id, false));
    state.activeFeatures = {};
    state.activeProfile = null;
    state.textScaleFactor = 1;
    applyTextScale(1, true);
    stopReading();
    stopVoiceNavigation();
    if (config.rememberPreferences) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      const activeTab = panel.querySelector('.h2s-tab-active');
      panel.innerHTML = buildPanelHTML(activeTab ? activeTab.dataset.tab : 'visual');
    }
    showNotification(t('notif.reset'));
    announce(t('notif.reset'));
  }

  // ============================================================
  // MUTATION OBSERVER  (Observer) — self-healing for SPAs (React,
  // Angular, Vue, Next.js). Re-mounts the widget if a framework
  // re-render removes it, and re-asserts active effect classes if
  // <html>'s class list is replaced. No-op-on-match → cannot loop.
  // ============================================================
  function desiredHtmlClasses() {
    const list = [];
    Object.keys(state.activeFeatures).forEach(id => {
      const def = FEATURES[id];
      if (def && def.class && state.activeFeatures[id]) list.push(def.class);
    });
    return list;
  }

  function healWidget() {
    if (!document.getElementById(TRIGGER_ID) || !document.getElementById(PANEL_ID)) {
      // Remove any half-present remnants, then rebuild + rebind.
      const oldT = document.getElementById(TRIGGER_ID); if (oldT) oldT.remove();
      const oldP = document.getElementById(PANEL_ID); if (oldP) oldP.remove();
      const wasOpen = state.panelOpen;
      state.panelOpen = false;
      buildWidget();
      attachWidgetListeners();
      if (wasOpen) openPanel();
    }
  }

  function healClasses() {
    const html = document.documentElement;
    desiredHtmlClasses().forEach(cls => { if (!html.classList.contains(cls)) html.classList.add(cls); });
  }

  function startObserver() {
    if (state.observer || typeof MutationObserver === 'undefined') return;
    const heal = rafThrottle('observerHeal', () => { healWidget(); healClasses(); });
    const obs = new MutationObserver(heal);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (document.body) obs.observe(document.body, { childList: true });
    state.observer = obs;
  }

  function stopObserver() {
    if (state.observer) { state.observer.disconnect(); state.observer = null; }
  }

  // ============================================================
  // ANALYTICS (Analytics) — telemetria de acessibilidade privacy-first.
  //
  // Autocontido para respeitar a restrição de arquivo único (UMD). Acumula
  // eventos em memória e os envia em lote para o backend do Help2See (POST
  // /api/collect). Garantias espelhadas no servidor (sanitizer/visitor):
  //   • envia APENAS o siteKey público — nunca a org/tenant;
  //   • NUNCA envia valores de formulário — no máximo o nome do campo + um
  //     código de validade genérico;
  //   • dispara-e-esquece (sendBeacon / fetch keepalive) — nunca bloqueia nem
  //     quebra a página hospedeira; todas as falhas são engolidas.
  // Ativa por padrão quando um siteKey é fornecido (divulgado nos Termos de
  // Uso); opt-out via Help2See.init({ analytics: { enabled: false } }).
  // ============================================================
  const Analytics = (function () {
    let acfg = null;
    let endpoint = null;
    let buffer = [];
    let timer = 0;
    let active = false;
    let lastPath = null;
    const touchedForms = new Set();
    const submittedForms = new Set();
    const listeners = [];                 // [{ target, type, fn, opts }]
    let _push = null, _replace = null;    // métodos do history salvos (p/ desfazer o patch)

    // ── Sessão + identidade + telemetria de uso ──────────────────
    let sessionId = null, sessionStart = 0, metaInfo = null, errorHooksInstalled = false;
    // Marco para medir o tempo de inicialização do plugin (best-effort).
    const _t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    function perfNow() {
      return (window.performance && performance.now) ? performance.now() : Date.now();
    }

    function bind(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      listeners.push({ target: target, type: type, fn: fn, opts: opts });
    }

    function genId() {
      try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fallback */ }
      return 'h2s-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    function detectOS() {
      const ua = navigator.userAgent || '';
      if (/Windows/.test(ua)) return 'windows';
      if (/Android/.test(ua)) return 'android';
      if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
      if (/Mac OS X/.test(ua)) return 'macos';
      if (/Linux/.test(ua)) return 'linux';
      return 'other';
    }
    function screenRes() {
      try { return (screen.width || 0) + 'x' + (screen.height || 0); } catch (e) { return ''; }
    }
    // Token de sessão do usuário logado (se houver). Validado e descartado no
    // servidor; o plugin nunca expõe nem confia em user_id direto.
    function authToken() {
      try { return (window.h2sAuth && h2sAuth.getToken && h2sAuth.getToken()) || undefined; }
      catch (e) { return undefined; }
    }

    // Captura erros de JS da página (sem PII — só mensagem técnica clipada).
    function installErrorHooks() {
      if (errorHooksInstalled) return;
      errorHooksInstalled = true;
      bind(window, 'error', function (e) {
        try {
          track('client_error', {
            message: (e && e.message ? String(e.message) : 'error').slice(0, 256),
            source: e && e.filename ? String(e.filename).slice(0, 256) : undefined,
            lineno: e && e.lineno ? e.lineno : undefined
          });
        } catch (_) { /* telemetria nunca quebra a página */ }
      });
      bind(window, 'unhandledrejection', function (e) {
        try {
          const r = e && e.reason;
          const m = r && r.message ? r.message : String(r);
          track('client_error', { message: ('unhandledrejection: ' + m).slice(0, 256) });
        } catch (_) { /* sem efeito */ }
      });
    }

    function endSession() {
      if (!sessionId) return;
      try { track('session_end', { duration_ms: Date.now() - sessionStart }); } catch (e) { /* sem efeito */ }
    }

    function detectBrowser() {
      const ua = navigator.userAgent || '';
      if (/Edg\//.test(ua)) return 'edge';
      if (/OPR\//.test(ua)) return 'opera';
      if (/Firefox\//.test(ua)) return 'firefox';
      if (/Chrome\//.test(ua)) return 'chrome';
      if (/Safari\//.test(ua)) return 'safari';
      return 'other';
    }
    function detectDevice() {
      try {
        return window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop';
      } catch (e) { return 'desktop'; }
    }
    function currentPath() {
      try { return location.pathname || '/'; } catch (e) { return '/'; }
    }

    // Snapshot heurístico de quais recursos de acessibilidade estão em uso. Só
    // as chaves da whitelist do servidor sobrevivem à ingestão; o resto é descartado.
    function a11ySnapshot() {
      const ids = Object.keys(state.activeFeatures || {});
      const has = function (kw) {
        return ids.some(function (id) { return id.toLowerCase().indexOf(kw) !== -1; });
      };
      const snap = { font_scale: state.textScaleFactor || 1 };
      if (has('contrast')) snap.high_contrast = true;
      if (has('keyboard') || has('focus')) snap.keyboard_nav = true;
      return snap;
    }

    function errorCode(v) {
      if (!v) return 'invalid';
      if (v.valueMissing) return 'required';
      if (v.typeMismatch) return 'invalid_format';
      if (v.patternMismatch) return 'pattern';
      if (v.tooShort || v.tooLong) return 'length';
      if (v.rangeOverflow || v.rangeUnderflow) return 'range';
      if (v.stepMismatch) return 'step';
      return 'invalid';
    }
    function fieldName(el) {
      const n = el && (el.name || el.id || el.type);
      return n ? String(n).slice(0, 64) : 'unknown';
    }
    function formName(form) {
      const n = form && (form.name || form.id);
      return n ? String(n).slice(0, 64) : 'form';
    }

    function track(type, detail) {
      if (!active) return;
      buffer.push({
        type: type,
        ts: Date.now(),
        path: currentPath(),
        detail: detail || undefined,
        device: detectDevice(),
        browser: detectBrowser(),
        a11y: a11ySnapshot()
      });
      // Safety cap: if the endpoint is unset/unreachable (flush early-returns
      // without clearing), a long session could otherwise grow the buffer
      // without bound. Keep only the most recent BUFFER_CAP events.
      const BUFFER_CAP = Math.max(acfg.maxBatch * 10, 200);
      if (buffer.length > BUFFER_CAP) buffer.splice(0, buffer.length - BUFFER_CAP);
      if (buffer.length >= acfg.maxBatch) flush(false);
    }

    function flush(useBeacon) {
      if (!active || !buffer.length || !endpoint) return;
      // Identidade OPCIONAL + contexto da sessão. auth_token=undefined é omitido
      // pelo JSON.stringify → o lote segue anônimo quando ninguém está logado.
      const payload = JSON.stringify({
        site_key: acfg.siteKey,
        plugin_version: VERSION,
        session_id: sessionId || undefined,
        auth_token: authToken(),
        events: buffer
      });
      buffer = [];
      try {
        if (useBeacon && navigator.sendBeacon) {
          // text/plain é "CORS-safelisted": o beacon vai cross-origin SEM
          // preflight (que o sendBeacon não consegue fazer). O backend
          // (EncodingTolerantRoute) força application/json ao ver corpo JSON.
          navigator.sendBeacon(endpoint, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
          return;
        }
      } catch (e) { /* segue para o fetch */ }
      try {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
          mode: 'cors',
          credentials: 'omit'
        }).catch(function () {});
      } catch (e) { /* nunca deixa a telemetria quebrar a página hospedeira */ }
    }

    // ── rastreio de interação com formulários ──────────────────
    function onInvalid(e) {
      const el = e.target;
      if (!el || !el.validity) return;
      // só nome do campo + código — o valor digitado NUNCA é lido nem enviado.
      track('form_error', { field: fieldName(el), code: errorCode(el.validity) });
    }
    function onFormInput(e) {
      const form = e.target && e.target.form;
      if (form) touchedForms.add(form);
    }
    function onSubmit(e) {
      if (e.target) submittedForms.add(e.target);
    }
    function reportAbandons() {
      touchedForms.forEach(function (form) {
        if (!submittedForms.has(form)) track('form_abandon', { form: formName(form) });
      });
      touchedForms.clear();
      submittedForms.clear();
    }

    // ── trocas de rota em SPA ──────────────────────────────────
    function onRouteChange() {
      const p = currentPath();
      if (p !== lastPath) { lastPath = p; track('page_view', null); }
    }
    function patchHistory() {
      try {
        _push = history.pushState;
        _replace = history.replaceState;
        history.pushState = function () { const r = _push.apply(this, arguments); onRouteChange(); return r; };
        history.replaceState = function () { const r = _replace.apply(this, arguments); onRouteChange(); return r; };
      } catch (e) { /* history não é "patchável" neste contexto */ }
    }
    function unpatchHistory() {
      try {
        if (_push) history.pushState = _push;
        if (_replace) history.replaceState = _replace;
      } catch (e) { /* sem efeito */ }
      _push = _replace = null;
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') { reportAbandons(); flush(true); }
    }
    function onPageHide() { reportAbandons(); endSession(); flush(true); }

    // ── auditor WCAG silencioso ────────────────────────────────
    // Roda UMA vez, sem NADA visual (sem painel, notificação, foco ou DOM),
    // logo após o plugin saber qual é o site. Mede a conformidade WCAG da
    // página e reporta o nível ao backend. Só inspeciona o DOM (leitura) e
    // envia dado técnico — nunca conteúdo.
    let audited = false;

    function isHiddenEl(el) {
      if (!el || !el.getBoundingClientRect) return true;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return true;
      if (parseFloat(cs.opacity) === 0) return true;
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0;
    }
    // Ignora o próprio widget do Help2See — auditamos a página hospedeira.
    function isOwnWidget(el) {
      return !!(el && el.closest && el.closest('#h2s-panel, #h2s-trigger, #h2s-magnifier-lens'));
    }
    function shortSelector(el) {
      if (!el || !el.tagName) return 'unknown';
      let s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      else if (el.classList && el.classList.length) s += '.' + el.classList[0];
      return s.slice(0, 64);
    }
    function hasAccessibleName(el) {
      if (!el) return false;
      if ((el.getAttribute('aria-label') || '').trim()) return true;
      if (el.getAttribute('aria-labelledby')) return true;
      if (el.id) {
        try {
          const id = (window.CSS && CSS.escape) ? CSS.escape(el.id) : el.id;
          if (document.querySelector('label[for="' + id + '"]')) return true;
        } catch (e) { /* seletor inválido — ignora */ }
      }
      if (el.closest && el.closest('label')) return true;
      if ((el.getAttribute('title') || '').trim()) return true;
      if ((el.textContent || '').trim()) return true;
      if (el.tagName === 'INPUT' && (el.getAttribute('value') || '').trim()) return true;
      return false;
    }

    // Contraste de cor (WCAG 1.4.3) — luminância relativa por sRGB.
    function parseRgb(str) {
      const m = str && str.match(/rgba?\(([^)]+)\)/i);
      if (!m) return null;
      const p = m[1].split(',').map(function (x) { return parseFloat(x); });
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function relLum(c) {
      const f = [c.r, c.g, c.b].map(function (v) {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    }
    function contrastRatio(fg, bg) {
      const l1 = relLum(fg), l2 = relLum(bg);
      const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    }
    // Sobe pelos ancestrais até achar um fundo opaco; assume página branca.
    function effectiveBg(el) {
      let node = el;
      while (node && node.nodeType === 1) {
        if (isOwnWidget(node)) break;
        const c = parseRgb(window.getComputedStyle(node).backgroundColor);
        if (c && c.a > 0) return c;
        node = node.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    }
    function requiredRatio(cs) {
      const size = parseFloat(cs.fontSize) || 16;
      const bold = cs.fontWeight === 'bold' || parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);   // ~14pt bold
      return large ? 3 : 4.5;
    }
    function hasDirectText(el) {
      for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim().length > 1) return true;
      }
      return false;
    }

    function runAudit() {
      if (audited || !active) return;
      audited = true;
      try {
        const counts = {
          contrast: 0, missing_alt: 0, missing_label: 0, missing_name: 0,
          focus: 0, no_lang: 0, no_title: 0, no_h1: 0
        };
        const CAP = 15;   // máx. de eventos detalhados por categoria (evita flood)

        // 1.1.1 — imagens sem alt (alt="" = decorativa, OK)
        const imgs = document.querySelectorAll('img:not([alt])');
        for (let i = 0; i < imgs.length; i++) {
          const el = imgs[i];
          if (isOwnWidget(el) || isHiddenEl(el)) continue;
          counts.missing_alt++;
          if (counts.missing_alt <= CAP) track('alt_issue', { selector: shortSelector(el) });
        }

        // 1.3.1 / 4.1.2 — campos de formulário sem rótulo acessível
        const fields = document.querySelectorAll('input, select, textarea');
        for (let i = 0; i < fields.length; i++) {
          const el = fields[i];
          const type = (el.getAttribute('type') || '').toLowerCase();
          if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue;
          if (isOwnWidget(el) || isHiddenEl(el)) continue;
          if (!hasAccessibleName(el)) {
            counts.missing_label++;
            if (counts.missing_label <= CAP) track('label_issue', { selector: shortSelector(el) });
          }
        }

        // 4.1.2 — links/botões sem nome acessível
        const interactives = document.querySelectorAll('a[href], button, [role="button"]');
        for (let i = 0; i < interactives.length; i++) {
          const el = interactives[i];
          if (isOwnWidget(el) || isHiddenEl(el)) continue;
          if (!hasAccessibleName(el)) {
            counts.missing_name++;
            if (counts.missing_name <= CAP) track('name_issue', { selector: shortSelector(el) });
          }
        }

        // 2.4.3 — tabindex positivo (ordem de foco quebrada)
        const tabbables = document.querySelectorAll('[tabindex]');
        for (let i = 0; i < tabbables.length; i++) {
          const el = tabbables[i];
          if (isOwnWidget(el)) continue;
          if (parseInt(el.getAttribute('tabindex'), 10) > 0) {
            counts.focus++;
            if (counts.focus <= CAP) track('focus_issue', { selector: shortSelector(el), reason: 'positive_tabindex' });
          }
        }

        // 1.4.3 — contraste de texto (amostra limitada por desempenho)
        const textEls = document.querySelectorAll('p, span, a, li, td, th, h1, h2, h3, h4, h5, h6, label, button, strong, em, small');
        let checked = 0;
        for (let i = 0; i < textEls.length && checked < 400; i++) {
          const el = textEls[i];
          if (isOwnWidget(el) || isHiddenEl(el) || !hasDirectText(el)) continue;
          checked++;
          const cs = window.getComputedStyle(el);
          const fg = parseRgb(cs.color);
          if (!fg) continue;
          const ratio = contrastRatio(fg, effectiveBg(el));
          const req = requiredRatio(cs);
          if (ratio + 0.05 < req) {   // pequena folga p/ arredondamento
            counts.contrast++;
            if (counts.contrast <= CAP) {
              track('contrast_issue', {
                selector: shortSelector(el),
                ratio: Math.round(ratio * 100) / 100,
                required: req
              });
            }
          }
        }

        // Critérios de nível de documento.
        if (!document.documentElement.getAttribute('lang')) counts.no_lang = 1;   // 3.1.1
        if (!document.title || !document.title.trim()) counts.no_title = 1;        // 2.4.2
        if (!document.querySelector('h1')) counts.no_h1 = 1;                       // 1.3.1/2.4.6

        // Nível de conformidade resultante.
        const levelA = counts.missing_alt + counts.missing_label + counts.missing_name
          + counts.no_lang + counts.no_title;
        const levelAA = counts.contrast + counts.focus + counts.no_h1;
        let level;
        if (levelA > 0) level = 'none';      // falha em algum critério nível A
        else if (levelAA > 0) level = 'A';   // passa A, falha AA
        else level = 'AA';                   // passa A e AA (nas checagens automáveis)
        const violations = levelA + levelAA;
        const score = Math.max(0, 100 - (levelA * 10 + counts.contrast * 3
          + counts.focus * 2 + (counts.no_h1 ? 5 : 0)));

        track('wcag_audit', {
          level: level,
          score: score,
          violations: violations,
          version: '2.1',
          contrast: counts.contrast,
          missing_alt: counts.missing_alt,
          missing_label: counts.missing_label,
          missing_name: counts.missing_name,
          no_lang: counts.no_lang,
          no_title: counts.no_title,
          no_h1: counts.no_h1
        });

        flush(false);   // manda o resultado da auditoria o quanto antes
      } catch (e) { /* a auditoria nunca pode quebrar a página hospedeira */ }
    }

    function scheduleAudit() {
      const launch = function () {
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(runAudit, { timeout: 3000 });
        } else {
          setTimeout(runAudit, 1500);
        }
      };
      // Espera o carregamento terminar para medir a página de fato.
      if (document.readyState === 'complete') launch();
      else bind(window, 'load', launch);
    }

    return {
      isActive: function () { return active; },
      track: track,

      start: function (cfg) {
        if (active) return;
        const a = (cfg && cfg.analytics) || {};
        if (!a.enabled || !a.siteKey) return;
        // Amostragem por sessão: decide uma única vez, aqui.
        if (typeof a.sampleRate === 'number' && a.sampleRate < 1
            && Math.random() > a.sampleRate) return;

        const baseUrl = (cfg.voice && cfg.voice.baseUrl)
          ? String(cfg.voice.baseUrl).replace(/\/+$/, '') : '';
        endpoint = a.endpoint || (baseUrl ? baseUrl + '/api/collect' : '');
        if (!endpoint) return;            // sem backend configurado → fica off

        acfg = {
          siteKey: a.siteKey,
          flushIntervalMs: a.flushIntervalMs || 15000,
          maxBatch: a.maxBatch || 30,
          wcagAudit: a.wcagAudit !== false   // auditoria WCAG ligada por padrão
        };
        active = true;
        lastPath = currentPath();

        // Sessão do plugin: id por carregamento + metadados de ambiente.
        sessionId = genId();
        sessionStart = Date.now();
        metaInfo = {
          os: detectOS(),
          language: (navigator.language || ''),
          screen: screenRes(),
          plugin_version: VERSION,
          device: detectDevice(),
          browser: detectBrowser()
        };
        installErrorHooks();

        bind(document, 'invalid', onInvalid, true);   // 'invalid' não borbulha
        bind(document, 'input', onFormInput, true);
        bind(document, 'submit', onSubmit, true);
        bind(window, 'popstate', onRouteChange);
        bind(document, 'visibilitychange', onVisibility);
        bind(window, 'pagehide', onPageHide);
        patchHistory();

        track('session_start', metaInfo);             // ciclo de vida da sessão
        track('page_view', null);                     // visualização inicial
        // Tempo de inicialização do plugin (do load do script até ativar aqui).
        track('perf_sample', { action: 'plugin_startup', ms: Math.round(perfNow() - _t0) });
        timer = setInterval(function () { flush(false); }, acfg.flushIntervalMs);

        // Auditoria WCAG silenciosa: roda uma vez, agora que o site é conhecido.
        if (acfg.wcagAudit) scheduleAudit();
      },

      stop: function () {
        if (!active) return;
        try { reportAbandons(); endSession(); flush(true); } catch (e) { /* sem efeito */ }
        if (timer) { clearInterval(timer); timer = 0; }
        unpatchHistory();
        listeners.forEach(function (l) {
          try { l.target.removeEventListener(l.type, l.fn, l.opts); } catch (e) { /* sem efeito */ }
        });
        listeners.length = 0;
        touchedForms.clear();
        submittedForms.clear();
        buffer = [];
        audited = false;
        active = false;
      }
    };
  })();

  // ============================================================
  // PUBLIC API
  // ============================================================
  const API = {
    init(userConfig = {}) {
      if (state.initialized) return API;
      // Precedence: explicit init() arg > window.H2SConfig (documented) > defaults.
      const globalCfg = (typeof window !== 'undefined' && window.H2SConfig) ? window.H2SConfig : {};
      config = { ...DEFAULTS, ...globalCfg, ...userConfig };
      // Shallow spread above would drop default voice fields (e.g. baseUrl)
      // when a caller passes only `voice.provider`. Deep-merge voice so the
      // ElevenLabs default (provider + baseUrl) survives partial overrides.
      config.voice = { ...DEFAULTS.voice, ...(globalCfg.voice || {}), ...(userConfig.voice || {}) };
      // Mesmo deep-merge para o analytics, para overrides parciais (ex.: só o
      // siteKey) preservarem os padrões (intervalo de flush, tamanho do lote,
      // derivação do endpoint).
      config.analytics = { ...DEFAULTS.analytics, ...(globalCfg.analytics || {}), ...(userConfig.analytics || {}) };

      // Resolve the active UI/voice language BEFORE anything renders, so the
      // very first paint of the widget is already localized (no pt→xx flash).
      // Precedence: explicit config > saved help2see_lang > browser > pt.
      state.language = resolveInitialLang();

      injectBaseStyles();
      loadPrefs();

      // Register the ElevenLabs provider whenever a backend URL is available.
      // It becomes the active provider by default (see DEFAULTS.voice); the
      // browser voice always stays registered as the free fallback.
      if (config.voice && config.voice.baseUrl) {
        providers.elevenlabs = new ElevenLabsVoiceProvider(config.voice.baseUrl);
      }

      buildWidget();
      attachWidgetListeners();
      bindKeyboard();
      restorePrefs();
      startObserver();

      // Keep the plugin's language in lockstep with the site chrome selector
      // and with other browser tabs (shared help2see_lang key + custom event).
      addDocListener('h2s-langchange', 'help2see:languagechange', onExternalLangChange);
      window.addEventListener('storage', onLangStorage);

      // Telemetria opt-in. Sem efeito a menos que analytics.enabled + siteKey estejam definidos.
      Analytics.start(config);

      if (config.theme === 'auto') {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onScheme = () => applyTheme('auto');
        if (mq.addEventListener) mq.addEventListener('change', onScheme);
        else if (mq.addListener) mq.addListener(onScheme);
        state._schemeMq = { mq, onScheme };
      }

      state.initialized = true;
      return API;
    },

    open() { openPanel(); return API; },
    close() { closePanel(); return API; },
    reset() { reset(); return API; },
    enableProfile(profileName) { applyProfile(profileName); return API; },
    readPage() {
      // Telemetria da leitura em voz alta programática. Atalhos de teclado/voz
      // chamam o readPage() interno direto e não são contados aqui (limitação v1).
      if (Analytics.isActive()) Analytics.track('tts_used', null);
      readPage();
      return API;
    },
    stopReading() { stopReading(); return API; },
    startVoiceNavigation() { startVoiceNavigation(); return API; },
    stopVoiceNavigation() { stopVoiceNavigation(); return API; },

    // Live language switch (pt | en | es). Updates UI, voice and persistence
    // and syncs the site chrome via the 'help2see:languagechange' event.
    setLanguage(lang) { setLanguage(lang); return API; },
    getLanguage() { return state.language; },

    // Register a custom TTS provider (must implement the VoiceProvider
    // interface). Lets hosts plug in OpenAI/Google/Azure later.
    registerVoiceProvider(name, provider) {
      if (name && provider && typeof provider.speak === 'function') {
        providers[name] = provider;
      }
      return API;
    },

    // Full teardown — removes all listeners, observers, DOM and styles.
    destroy() {
      if (!state.initialized) return API;
      Analytics.stop();   // descarrega eventos pendentes + remove listeners/timer
      stopObserver();
      stopReading();
      cancelFeedback();         // silence any in-flight UI/nav feedback speech
      ttsEngine.clearCache();   // revoke all cached MP3 object URLs (no leak)
      stopVoiceNavigation();
      Object.keys(state.activeFeatures).forEach(id => applyFeature(id, false));
      Object.keys(state.docHandlers).forEach(removeDocListener);
      Object.keys(state.rafIds).forEach(cancelRaf);
      window.removeEventListener('storage', onLangStorage);
      if (_textScaleTimer) { clearTimeout(_textScaleTimer); _textScaleTimer = 0; }
      if (state._schemeMq) {
        const { mq, onScheme } = state._schemeMq;
        if (mq.removeEventListener) mq.removeEventListener('change', onScheme);
        else if (mq.removeListener) mq.removeListener(onScheme);
        state._schemeMq = null;
      }
      applyTextScale(1, true); // restore any per-element font sizes before teardown
      removeStyle('h2s-base-styles');
      [PANEL_ID, TRIGGER_ID, 'h2s-notif', 'h2s-voice-dot', 'h2s-magnifier-lens', 'h2s-mask-top', 'h2s-mask-bottom', 'h2s-reading-guide']
        .forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
      state.panelOpen = false;
      state.initialized = false;
      return API;
    },

    version: VERSION,
    _state: state,
    _config: config,
  };

  return API;
});
