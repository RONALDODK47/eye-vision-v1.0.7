/** Credenciais e TLS a partir de certificado A1 (.pfx). */
import https from 'node:https';
import forge from 'node-forge';

export function loadPfxCredentials(pfx, passphrase) {
  const der = forge.util.createBuffer(Buffer.from(pfx).toString('binary'));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  if (!certBag?.cert || !keyBag?.key) {
    throw new Error('Não foi possível extrair chave/certificado do A1.');
  }
  const certPem = forge.pki.certificateToPem(certBag.cert);
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes();
  const certB64 = forge.util.encode64(certDer);
  return { privateKeyPem, certPem, certB64 };
}

export function postSoapMtls({ url, pfx, passphrase, body, soapVersion = '1.2', soapAction }) {
  const timeoutMs = Number(process.env.SEFAZ_DIST_TIMEOUT_MS || 90_000);
  const headers =
    soapVersion === '1.1'
      ? {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"${soapAction}"`,
          Accept: 'application/soap+xml, text/xml, */*',
          'Content-Length': Buffer.byteLength(body),
        }
      : {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${soapAction}"`,
          Accept: 'application/soap+xml, text/xml, */*',
          'Content-Length': Buffer.byteLength(body),
        };

  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: 'POST',
        pfx,
        passphrase,
        rejectUnauthorized: process.env.SEFAZ_TLS_INSECURE === '1' ? false : true,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`SEFAZ não respondeu em ${Math.round(timeoutMs / 1000)}s.`));
    });
    req.on('error', (err) => reject(new Error(`Erro TLS SEFAZ: ${err.message}`)));
    req.write(body);
    req.end();
  });
}
