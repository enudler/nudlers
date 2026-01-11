import { exec } from 'child_process';
import { promisify } from 'util';
import { getDB } from '../db';

const execAsync = promisify(exec);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { version, validateOnly } = req.body;

    if (!version) {
        return res.status(400).json({ error: 'Version is required' });
    }

    const client = await getDB();

    try {
        // 1. Validate version exists before installing
        if (version !== 'latest' && version !== 'master') {
            try {
                console.log(`[Update Library] Validating version ${version} exists...`);
                // npm view returns exit code 0 if exists
                await execAsync(`npm view israeli-bank-scrapers@${version} version`);
            } catch (e) {
                console.error(`[Update Library] Version ${version} not found in registry`);
                return res.status(404).json({ error: `Version ${version} not found in npm registry.` });
            }
        }
        if (validateOnly) {
            return res.status(200).json({
                message: `Version ${version} validated successfully.`,
                success: true
            });
        }

        // 3. Trigger the installation
        console.log(`[Update Library] Triggering install for israeli-bank-scrapers@${version}...`);

        // Using --no-save ensures we don't modify package.json at runtime, which is safer in Docker
        const command = `npm install israeli-bank-scrapers@${version} --no-save`;

        try {
            const { stdout, stderr } = await execAsync(command);
            console.log(`[Update Library] npm install stdout: ${stdout}`);
            if (stderr) console.error(`[Update Library] npm install stderr: ${stderr}`);

            // 4. Update the version in the database ONLY after successful install
            await client.query(
                `INSERT INTO app_settings (key, value, description) 
           VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
                ['israeli_bank_scrapers_version', JSON.stringify(version), 'Specific version or branch of the scraper library']
            );

            res.status(200).json({
                message: `Library updated successfully to ${version}. New version is ready for use.`,
                success: true
            });

            // 4. No restart needed anymore as we use workers
            console.log('[Update Library] Success. Library updated without restart.');

        } catch (installError) {
            console.error('[Update Library] Install failed:', installError);
            return res.status(500).json({
                error: 'Failed to install library version',
                details: installError.message
            });
        }

    } catch (error) {
        console.error('[Update Library] API error:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Internal server error',
            success: false
        });
    } finally {
        client.release();
    }
}
