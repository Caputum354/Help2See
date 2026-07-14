-- Help2See — site_key EXCLUSIVA do site institucional (produção/Vercel).
--
-- Registra a organização e o site oficiais para a telemetria do plugin
-- (POST /api/collect). A site_key é pública (vai no HTML), mas só funciona
-- porque está cadastrada aqui com is_active = 1; o domain é informativo.
--
-- Rodar no MySQL local E no MySQL de produção (Railway):
--   Get-Content db/mysql_site_producao.sql -Raw | mysql -u root help2see

USE help2see;

INSERT INTO organizations (id, name)
VALUES (2, 'Help2See')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO sites (id, org_id, site_key, name, domain, is_active)
VALUES (2, 2, '01KXF5AHSAE0DNKZFX27SXWCRF', 'Site institucional Help2See',
        'help2see.vercel.app', 1)
ON DUPLICATE KEY UPDATE
  site_key = VALUES(site_key), name = VALUES(name),
  domain = VALUES(domain), is_active = VALUES(is_active);
