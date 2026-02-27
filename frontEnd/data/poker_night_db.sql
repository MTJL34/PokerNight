-- Export SQL normalise genere depuis frontEnd/data/*.json
-- Date: 2026-02-27T09:17:48.886Z
-- Cible: MySQL 8+

START TRANSACTION;

-- Supprimer dans l'ordre des dependances
DROP VIEW IF EXISTS v_session_financials;
DROP TABLE IF EXISTS session_payouts;
DROP TABLE IF EXISTS entry_buyins;
DROP TABLE IF EXISTS session_entries;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS positions;

-- Dimensions
CREATE TABLE players (
  player_id INT PRIMARY KEY,
  player_name VARCHAR(255) NOT NULL
);

CREATE TABLE positions (
  position_id INT PRIMARY KEY,
  rank_no TINYINT NOT NULL,
  CONSTRAINT uq_positions_rank UNIQUE (rank_no),
  CONSTRAINT chk_positions_rank CHECK (rank_no BETWEEN 1 AND 9)
);

CREATE TABLE sessions (
  session_id INT PRIMARY KEY,
  session_name VARCHAR(255) NOT NULL
);

-- Une participation par joueur et session
CREATE TABLE session_entries (
  session_id INT NOT NULL,
  player_id INT NOT NULL,
  position_id INT NOT NULL,
  PRIMARY KEY (session_id, player_id),
  CONSTRAINT uq_entry_position UNIQUE (session_id, position_id),
  CONSTRAINT fk_entry_session FOREIGN KEY (session_id) REFERENCES sessions(session_id),
  CONSTRAINT fk_entry_player FOREIGN KEY (player_id) REFERENCES players(player_id),
  CONSTRAINT fk_entry_position FOREIGN KEY (position_id) REFERENCES positions(position_id)
);

-- Buy-ins atomiques: 1 ligne = 10 EUR
CREATE TABLE entry_buyins (
  session_id INT NOT NULL,
  player_id INT NOT NULL,
  buyin_no TINYINT NOT NULL,
  amount INT NOT NULL DEFAULT 10,
  PRIMARY KEY (session_id, player_id, buyin_no),
  CONSTRAINT chk_buyin_no CHECK (buyin_no BETWEEN 1 AND 3),
  CONSTRAINT chk_buyin_amount CHECK (amount = 10),
  CONSTRAINT fk_buyin_entry FOREIGN KEY (session_id, player_id)
    REFERENCES session_entries(session_id, player_id) ON DELETE CASCADE
);

-- Gains normalises: une ligne par place payee
CREATE TABLE session_payouts (
  session_id INT NOT NULL,
  rank_no TINYINT NOT NULL,
  player_id INT NOT NULL,
  amount INT NOT NULL,
  PRIMARY KEY (session_id, rank_no),
  CONSTRAINT uq_payout_player UNIQUE (session_id, player_id),
  CONSTRAINT chk_payout_rank CHECK (rank_no BETWEEN 1 AND 9),
  CONSTRAINT chk_payout_amount CHECK (amount >= 0),
  CONSTRAINT fk_payout_session FOREIGN KEY (session_id) REFERENCES sessions(session_id),
  CONSTRAINT fk_payout_entry FOREIGN KEY (session_id, player_id)
    REFERENCES session_entries(session_id, player_id) ON DELETE CASCADE
);

-- Vue de controle pot vs gains
CREATE VIEW v_session_financials AS
SELECT
  s.session_id,
  s.session_name,
  COALESCE(b.total_buyins, 0) AS total_buyins,
  COALESCE(p.total_payouts, 0) AS total_payouts,
  COALESCE(b.total_buyins, 0) - COALESCE(p.total_payouts, 0) AS balance
FROM sessions s
LEFT JOIN (
  SELECT session_id, SUM(amount) AS total_buyins
  FROM entry_buyins
  GROUP BY session_id
) b ON b.session_id = s.session_id
LEFT JOIN (
  SELECT session_id, SUM(amount) AS total_payouts
  FROM session_payouts
  GROUP BY session_id
) p ON p.session_id = s.session_id;

INSERT INTO players (player_id, player_name) VALUES
  (1, 'MTJL'),
  (2, 'Nico'),
  (3, 'Mu'),
  (4, 'Clem'),
  (5, 'Arnaud'),
  (6, 'Michel'),
  (7, 'Ben'),
  (8, 'PAM'),
  (9, 'Yo'),
  (10, 'Seb'),
  (11, 'Mania'),
  (12, 'Dim'),
  (13, 'JP'),
  (14, 'Vincent'),
  (15, 'Enzo'),
  (16, 'Ylann');

INSERT INTO positions (position_id, rank_no) VALUES
  (1, 1),
  (2, 2),
  (3, 3),
  (4, 4),
  (5, 5),
  (6, 6),
  (7, 7),
  (8, 8),
  (9, 9);

INSERT INTO sessions (session_id, session_name) VALUES
  (1, 'Poker 1'),
  (2, 'Poker 2'),
  (3, 'Poker 3'),
  (4, 'Poker 4'),
  (5, 'Poker 5'),
  (6, 'Poker 6'),
  (7, 'Poker 7'),
  (8, 'Poker 8'),
  (9, 'Poker 9');

INSERT INTO session_entries (session_id, player_id, position_id) VALUES
  (1, 2, 1),
  (1, 8, 2),
  (1, 5, 3),
  (1, 16, 4),
  (1, 4, 5),
  (1, 1, 6),
  (1, 3, 7),
  (1, 12, 8),
  (2, 5, 1),
  (2, 2, 2),
  (2, 8, 3),
  (2, 6, 4),
  (2, 11, 5),
  (2, 3, 6),
  (2, 4, 7),
  (2, 1, 8),
  (2, 12, 9),
  (3, 1, 1),
  (3, 6, 2),
  (3, 4, 3),
  (3, 3, 4),
  (3, 13, 5),
  (3, 7, 6),
  (3, 2, 7),
  (3, 10, 8),
  (3, 5, 9),
  (4, 6, 1),
  (4, 11, 2),
  (4, 3, 3),
  (4, 2, 4),
  (4, 8, 5),
  (4, 1, 6),
  (4, 10, 7),
  (5, 1, 1),
  (5, 3, 2),
  (5, 7, 3),
  (5, 4, 4),
  (5, 6, 5),
  (5, 8, 6),
  (5, 2, 7),
  (5, 5, 8),
  (6, 3, 1),
  (6, 7, 2),
  (6, 9, 3),
  (6, 2, 4),
  (6, 4, 5),
  (6, 1, 6),
  (6, 8, 7),
  (7, 9, 1),
  (7, 1, 2),
  (7, 4, 3),
  (7, 7, 4),
  (7, 2, 5),
  (7, 14, 6),
  (7, 15, 7),
  (7, 5, 8),
  (8, 9, 1),
  (8, 2, 2),
  (8, 4, 3),
  (8, 7, 4),
  (8, 6, 5),
  (8, 1, 6),
  (8, 3, 7),
  (8, 5, 8),
  (9, 1, 1),
  (9, 2, 2),
  (9, 3, 3),
  (9, 4, 4),
  (9, 5, 5),
  (9, 6, 6),
  (9, 7, 7),
  (9, 8, 8);

INSERT INTO entry_buyins (session_id, player_id, buyin_no, amount) VALUES
  (1, 2, 1, 10),
  (1, 8, 1, 10),
  (1, 8, 2, 10),
  (1, 5, 1, 10),
  (1, 5, 2, 10),
  (1, 5, 3, 10),
  (1, 16, 1, 10),
  (1, 16, 2, 10),
  (1, 4, 1, 10),
  (1, 4, 2, 10),
  (1, 4, 3, 10),
  (1, 1, 1, 10),
  (1, 1, 2, 10),
  (1, 3, 1, 10),
  (1, 3, 2, 10),
  (1, 3, 3, 10),
  (1, 12, 1, 10),
  (1, 12, 2, 10),
  (1, 12, 3, 10),
  (2, 5, 1, 10),
  (2, 5, 2, 10),
  (2, 5, 3, 10),
  (2, 2, 1, 10),
  (2, 8, 1, 10),
  (2, 8, 2, 10),
  (2, 8, 3, 10),
  (2, 6, 1, 10),
  (2, 6, 2, 10),
  (2, 11, 1, 10),
  (2, 11, 2, 10),
  (2, 11, 3, 10),
  (2, 3, 1, 10),
  (2, 4, 1, 10),
  (2, 1, 1, 10),
  (2, 1, 2, 10),
  (2, 12, 1, 10),
  (3, 1, 1, 10),
  (3, 1, 2, 10),
  (3, 1, 3, 10),
  (3, 6, 1, 10),
  (3, 6, 2, 10),
  (3, 6, 3, 10),
  (3, 4, 1, 10),
  (3, 3, 1, 10),
  (3, 3, 2, 10),
  (3, 13, 1, 10),
  (3, 13, 2, 10),
  (3, 13, 3, 10),
  (3, 7, 1, 10),
  (3, 7, 2, 10),
  (3, 2, 1, 10),
  (3, 10, 1, 10),
  (3, 10, 2, 10),
  (3, 10, 3, 10),
  (3, 5, 1, 10),
  (3, 5, 2, 10),
  (3, 5, 3, 10),
  (4, 6, 1, 10),
  (4, 6, 2, 10),
  (4, 11, 1, 10),
  (4, 3, 1, 10),
  (4, 3, 2, 10),
  (4, 2, 1, 10),
  (4, 2, 2, 10),
  (4, 8, 1, 10),
  (4, 8, 2, 10),
  (4, 1, 1, 10),
  (4, 1, 2, 10),
  (4, 1, 3, 10),
  (4, 10, 1, 10),
  (4, 10, 2, 10),
  (4, 10, 3, 10),
  (5, 1, 1, 10),
  (5, 1, 2, 10),
  (5, 1, 3, 10),
  (5, 3, 1, 10),
  (5, 3, 2, 10),
  (5, 3, 3, 10),
  (5, 7, 1, 10),
  (5, 4, 1, 10),
  (5, 4, 2, 10),
  (5, 6, 1, 10),
  (5, 8, 1, 10),
  (5, 8, 2, 10),
  (5, 8, 3, 10),
  (5, 2, 1, 10),
  (5, 5, 1, 10),
  (5, 5, 2, 10),
  (5, 5, 3, 10),
  (6, 3, 1, 10),
  (6, 7, 1, 10),
  (6, 7, 2, 10),
  (6, 9, 1, 10),
  (6, 9, 2, 10),
  (6, 9, 3, 10),
  (6, 2, 1, 10),
  (6, 2, 2, 10),
  (6, 2, 3, 10),
  (6, 4, 1, 10),
  (6, 1, 1, 10),
  (6, 1, 2, 10),
  (6, 1, 3, 10),
  (6, 8, 1, 10),
  (7, 9, 1, 10),
  (7, 9, 2, 10),
  (7, 1, 1, 10),
  (7, 4, 1, 10),
  (7, 4, 2, 10),
  (7, 4, 3, 10),
  (7, 7, 1, 10),
  (7, 7, 2, 10),
  (7, 2, 1, 10),
  (7, 14, 1, 10),
  (7, 14, 2, 10),
  (7, 14, 3, 10),
  (7, 15, 1, 10),
  (7, 15, 2, 10),
  (7, 15, 3, 10),
  (7, 5, 1, 10),
  (7, 5, 2, 10),
  (7, 5, 3, 10),
  (8, 9, 1, 10),
  (8, 2, 1, 10),
  (8, 4, 1, 10),
  (8, 4, 2, 10),
  (8, 4, 3, 10),
  (8, 7, 1, 10),
  (8, 7, 2, 10),
  (8, 6, 1, 10),
  (8, 6, 2, 10),
  (8, 6, 3, 10),
  (8, 1, 1, 10),
  (8, 1, 2, 10),
  (8, 1, 3, 10),
  (8, 3, 1, 10),
  (8, 3, 2, 10),
  (8, 3, 3, 10),
  (8, 5, 1, 10),
  (8, 5, 2, 10),
  (8, 5, 3, 10),
  (9, 1, 1, 10),
  (9, 2, 1, 10),
  (9, 3, 1, 10),
  (9, 4, 1, 10),
  (9, 5, 1, 10),
  (9, 6, 1, 10),
  (9, 7, 1, 10),
  (9, 8, 1, 10);

INSERT INTO session_payouts (session_id, rank_no, player_id, amount) VALUES
  (1, 1, 2, 120),
  (1, 2, 8, 50),
  (1, 3, 5, 20),
  (2, 1, 5, 100),
  (2, 2, 2, 50),
  (2, 3, 8, 20),
  (3, 1, 1, 130),
  (3, 2, 6, 60),
  (3, 3, 4, 20),
  (4, 1, 6, 90),
  (4, 2, 11, 40),
  (4, 3, 3, 20),
  (5, 1, 1, 100),
  (5, 2, 3, 50),
  (5, 3, 7, 20),
  (6, 1, 3, 90),
  (6, 2, 7, 40),
  (6, 3, 9, 10),
  (7, 1, 9, 120),
  (7, 2, 1, 40),
  (7, 3, 4, 20),
  (8, 1, 9, 100),
  (8, 2, 2, 60),
  (8, 3, 4, 30),
  (9, 1, 1, 80);

COMMIT;
ALTER TABLE players
ADD CONSTRAINT uq_players_name UNIQUE (player_name);

