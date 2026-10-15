# Changelog

## 0.7.0

- Enoshima redrawn in its familiar outline, traced from several photographs taken from the Kamakura side: a sheer cliff with a rounded shoulder, a gently domed wooded crown, the Sea Candle about two thirds across (a slender lattice tower with its observation deck and lantern), a long slope to a small wooded hump, white buildings along the waterline, and the yacht harbor with its masts and little white lighthouse. By day the woods are green and the cliff shows bare rock; from sunset on it is a silhouette.

## 0.6.0

- Today's moon is listed in the Shoreline tab and in the light dot's tooltip: its phase, how much is lit, and when it rises, is highest (due south) and sets. These follow the phase: a new moon is highest around noon, a first quarter in the evening, a full moon around midnight, a last quarter at dawn, about 50 minutes later each day.
- Tests check the moon's highest point for each phase across a lunation and the daily delay.

## 0.5.0

- The sun and moon follow the real sky. The Shoreline is now a panorama from east to north-west, so the sun rises over the Miura peninsula, crosses the open sea and sets by Enoshima and Fuji (or over the Koshigoe hills in summer).
- The moon is computed from a lunar theory: it rises and sets at its true times, shows its real phase for the day (crescent, half, gibbous, full), and turns its lit side toward the sun. By day it is a faint ghost; near new moon, or close to the sun, it is not shown.
- The stars sit on the celestial sphere and wheel across the sky with the sidereal time.
- Landmarks are placed at their true bearings from the beach at Koshigoe.

## 0.4.0

- Shoreline redrawn after a real photograph, from Koshigoe on the Kamakura side: Enoshima's true profile (a sheer cliff, a flat wooded top with the Sea Candle, a long slope toward the causeway), Fuji just beyond it, the line of lights along the causeway, the Koshigoe shore with apartment blocks and the green harbor light, concrete breakwaters in the foreground, two surfers by day, and a calmer, silvery sea.
- Island and shore lights come on as the sun goes down, fully by 6° below the horizon.

## 0.3.0

- Shoreline drawn at twice the resolution (about 480 pixels across) and recomposed from the beach at Tsujido: Enoshima close on the left with a wooded skyline, the Sea Candle lighthouse and town lights that reflect on the water at dusk and night; a breaking wave with clumped foam and lacy whitewash; wet sand that mirrors the sky; long cloud streaks lit from below at sunrise and sunset; a distant sail by day.

## 0.2.1

- Shoreline: making the panel taller no longer stretches the picture. Pixels stay square, the sea and beach keep their height, and the extra space becomes more sky (the midday sun climbs higher in a tall panel).

## 0.2.0

- Midday is now a blue sky: the editor opens from night navy into a clear sky blue through the morning, and syntax colors become pale tints that float on it (lilac keywords, ice-blue functions, green strings, peach numbers, sunlight-yellow types).
- Keywords stay in the lilac family all day.
- Contrast requirements scale with the brightness of the sky; every syntax color stays at or above WCAG AA at every hour.
- Buttons deepen to ocean blue under the midday sky.

## 0.1.1

- New extension icon: the full Shonan sunset artwork.

## 0.1.0

First release.

- **Shonan Vibes** dark color theme, with a moonlit static base.
- Dynamic colors that follow the real sun over the Shonan coast (or your own coordinates, or fixed sunrise/sunset times), interpolated continuously in OKLab.
- Atmospheric status bar: sea, a horizon line that warms at sunrise and sunset, and sand at the remote indicator.
- Shoreline: a pixel-art view of the coast in the bottom panel, and an editor tab that previews any hour.
- Settings for intensity, update interval, ocean saturation, night darkness, seasonal tint, cloud cover, local time, and holding the light at a time of day.
