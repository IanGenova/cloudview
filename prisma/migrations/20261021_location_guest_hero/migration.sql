ALTER TABLE `Location` ADD COLUMN `heroImageUrl` TEXT NULL;

UPDATE `Location` AS l
INNER JOIN `Hotel` AS h ON h.`id` = l.`hotelId`
SET l.`heroImageUrl` = '/cloudview/demo/pool-deck.webp',
    l.`description` = CASE
      WHEN l.`description` = 'Poolside NFC panel for food, towels, and pool info.'
      THEN 'Relax by the water. Order refreshments or ask our team for anything you need.'
      ELSE l.`description`
    END
WHERE h.`slug` = 'cloud-view-demo'
  AND l.`name` = 'Pool Deck'
  AND l.`heroImageUrl` IS NULL;
