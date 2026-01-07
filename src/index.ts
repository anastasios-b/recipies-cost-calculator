interface Recipe {
    id: string;
    name: string;
    weight: number;
    dimensions: {
        length: number;
        width: number;
        height: number;
        unit: string;
    };
    yield_percentage: number;
    waste_factor: number;
    unit_of_measure: string;
    inventory_location: string;
    parts: Array<{
        name: string;
        quantity: number;
        cost_per_unit: number;
    }>;
    labor: Array<{
        type: string;
        cost_per_hour: number;
        hours_needed: number;
    }>;
    created_at: string;
    updated_at: string;
}

interface CostSummary {
    subtotal: number;
    waste_factor: number;
    waste_amount: number;
    total: number;
    currency: string;
    unit_of_measure: string;
}

interface RecipeCostBreakdown {
    recipe_id: string;
    recipe_name: string;
    cost_summary: CostSummary;
}

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function validateRecipe(recipe: any): { valid: boolean; message?: string } {
    const requiredFields = [
        'name', 'weight', 'dimensions', 'yield_percentage', 
        'waste_factor', 'unit_of_measure', 'inventory_location',
        'parts', 'labor'
    ];
    
    const missingFields = requiredFields.filter(field => !(field in recipe));
    if (missingFields.length > 0) {
        return { valid: false, message: `Missing required fields: ${missingFields.join(', ')}` };
    }

    const dims = recipe.dimensions;
    if (!dims || typeof dims !== 'object' || !dims.length || !dims.width || !dims.height || !dims.unit) {
        return { valid: false, message: 'Invalid dimensions object. Must include length, width, height, and unit' };
    }

    if (!Array.isArray(recipe.parts) || recipe.parts.some((part: any) => !part.name || part.quantity === undefined || part.cost_per_unit === undefined)) {
        return { valid: false, message: 'Invalid parts array. Each part must have name, quantity, and cost_per_unit' };
    }

    if (!Array.isArray(recipe.labor) || recipe.labor.some((labor: any) => !labor.type || labor.cost_per_hour === undefined || labor.hours_needed === undefined)) {
        return { valid: false, message: 'Invalid labor array. Each labor item must have type, cost_per_hour, and hours_needed' };
    }

    return { valid: true };
}

function validatePartialRecipe(recipe: any): { valid: boolean; message?: string } {
    if (recipe.dimensions !== undefined) {
        const dims = recipe.dimensions;
        if (dims && (typeof dims !== 'object' || !dims.length || !dims.width || !dims.height || !dims.unit)) {
            return { valid: false, message: 'Invalid dimensions object. Must include length, width, height, and unit' };
        }
    }

    if (recipe.parts !== undefined) {
        if (!Array.isArray(recipe.parts) || recipe.parts.some((part: any) => !part.name || part.quantity === undefined || part.cost_per_unit === undefined)) {
            return { valid: false, message: 'Invalid parts array. Each part must have name, quantity, and cost_per_unit' };
        }
    }

    if (recipe.labor !== undefined) {
        if (!Array.isArray(recipe.labor) || recipe.labor.some((labor: any) => !labor.type || labor.cost_per_hour === undefined || labor.hours_needed === undefined)) {
            return { valid: false, message: 'Invalid labor array. Each labor item must have type, cost_per_hour, and hours_needed' };
        }
    }

    if (recipe.weight !== undefined && (typeof recipe.weight !== 'number' || recipe.weight < 0)) {
        return { valid: false, message: 'Weight must be a positive number' };
    }

    if (recipe.yield_percentage !== undefined && (typeof recipe.yield_percentage !== 'number' || recipe.yield_percentage < 0 || recipe.yield_percentage > 100)) {
        return { valid: false, message: 'Yield percentage must be a number between 0 and 100' };
    }

    if (recipe.waste_factor !== undefined && (typeof recipe.waste_factor !== 'number' || recipe.waste_factor < 0 || recipe.waste_factor >= 1)) {
        return { valid: false, message: 'Waste factor must be a number between 0 and 1' };
    }

    return { valid: true };
}

function calculateRecipeCost(recipe: Recipe): RecipeCostBreakdown {
    if (!recipe) {
        throw new Error('Recipe is required for cost calculation');
    }

    const partsCost = recipe.parts.reduce((total, part) => {
        return total + (part.quantity * part.cost_per_unit);
    }, 0);

    const laborCost = recipe.labor.reduce((total, job) => {
        return total + (job.hours_needed * job.cost_per_hour);
    }, 0);

    const subtotal = partsCost + laborCost;
    const costWithWaste = subtotal / (1 - (recipe.waste_factor || 0));
    const wasteAmount = costWithWaste - subtotal;

    return {
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        cost_summary: {
            subtotal: subtotal,
            waste_factor: recipe.waste_factor,
            waste_amount: wasteAmount,
            total: costWithWaste,
            currency: 'USD',
            unit_of_measure: recipe.unit_of_measure || 'piece'
        }
    };
}

async function handleCORS(request: Request): Promise<Response | null> {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }
    return null;
}

function sendJSON(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

async function getRecipeById(id: string, env: any): Promise<Recipe | null> {
    const recipeResult = await env.DB.prepare(
        'SELECT * FROM recipes WHERE id = ?'
    ).bind(id).first();

    if (!recipeResult) {
        return null;
    }

    const partsResult = await env.DB.prepare(
        'SELECT name, quantity, cost_per_unit FROM recipe_parts WHERE recipe_id = ?'
    ).bind(id).all();

    const laborResult = await env.DB.prepare(
        'SELECT type, cost_per_hour, hours_needed FROM recipe_labor WHERE recipe_id = ?'
    ).bind(id).all();

    return {
        id: recipeResult.id,
        name: recipeResult.name || '',
        weight: recipeResult.weight || 0,
        dimensions: {
            length: recipeResult.length_unit || 0,
            width: recipeResult.width || 0,
            height: recipeResult.height || 0,
            unit: recipeResult.dimension_unit || ''
        },
        yield_percentage: recipeResult.yield_percentage || 0,
        waste_factor: recipeResult.waste_factor || 0,
        unit_of_measure: recipeResult.unit_of_measure || '',
        inventory_location: recipeResult.inventory_location || '',
        parts: partsResult.results || [],
        labor: laborResult.results || [],
        created_at: recipeResult.created_at || '',
        updated_at: recipeResult.updated_at || ''
    };
}

async function getAllRecipes(env: any): Promise<Recipe[]> {
    const recipesResult = await env.DB.prepare('SELECT * FROM recipes ORDER BY created_at DESC').all();
    
    const recipes: Recipe[] = [];
    const recipeRows = recipesResult.results || [];
    
    for (const recipeRow of recipeRows) {
        const partsResult = await env.DB.prepare(
            'SELECT name, quantity, cost_per_unit FROM recipe_parts WHERE recipe_id = ?'
        ).bind(recipeRow.id).all();

        const laborResult = await env.DB.prepare(
            'SELECT type, cost_per_hour, hours_needed FROM recipe_labor WHERE recipe_id = ?'
        ).bind(recipeRow.id).all();

        recipes.push({
            id: recipeRow.id,
            name: recipeRow.name || '',
            weight: recipeRow.weight || 0,
            dimensions: {
                length: recipeRow.length_unit || 0,
                width: recipeRow.width || 0,
                height: recipeRow.height || 0,
                unit: recipeRow.dimension_unit || ''
            },
            yield_percentage: recipeRow.yield_percentage || 0,
            waste_factor: recipeRow.waste_factor || 0,
            unit_of_measure: recipeRow.unit_of_measure || '',
            inventory_location: recipeRow.inventory_location || '',
            parts: partsResult.results || [],
            labor: laborResult.results || [],
            created_at: recipeRow.created_at || '',
            updated_at: recipeRow.updated_at || ''
        });
    }
    
    return recipes;
}

async function createRecipe(recipeData: any, env: any): Promise<Recipe> {
    const id = generateUUID();
    const now = new Date().toISOString();

    await env.DB.prepare(`
        INSERT INTO recipes (id, name, weight, length_unit, width, height, dimension_unit, 
                           yield_percentage, waste_factor, unit_of_measure, inventory_location, 
                           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        id,
        recipeData.name,
        recipeData.weight,
        recipeData.dimensions.length,
        recipeData.dimensions.width,
        recipeData.dimensions.height,
        recipeData.dimensions.unit,
        recipeData.yield_percentage,
        recipeData.waste_factor,
        recipeData.unit_of_measure,
        recipeData.inventory_location,
        now,
        now
    ).run();

    for (const part of recipeData.parts) {
        await env.DB.prepare(`
            INSERT INTO recipe_parts (recipe_id, name, quantity, cost_per_unit)
            VALUES (?, ?, ?, ?)
        `).bind(id, part.name, part.quantity, part.cost_per_unit).run();
    }

    for (const labor of recipeData.labor) {
        await env.DB.prepare(`
            INSERT INTO recipe_labor (recipe_id, type, cost_per_hour, hours_needed)
            VALUES (?, ?, ?, ?)
        `).bind(id, labor.type, labor.cost_per_hour, labor.hours_needed).run();
    }

    return await getRecipeById(id, env) as Recipe;
}

async function updateRecipe(id: string, updateData: any, env: any): Promise<Recipe | null> {
    const existingRecipe = await getRecipeById(id, env);
    if (!existingRecipe) {
        return null;
    }

    const now = new Date().toISOString();
    const updatedRecipe = { ...existingRecipe, ...updateData, id, updated_at: now };

    await env.DB.prepare(`
        UPDATE recipes SET name = ?, weight = ?, length_unit = ?, width = ?, height = ?, 
                         dimension_unit = ?, yield_percentage = ?, waste_factor = ?, 
                         unit_of_measure = ?, inventory_location = ?, updated_at = ?
        WHERE id = ?
    `).bind(
        updatedRecipe.name,
        updatedRecipe.weight,
        updatedRecipe.dimensions.length,
        updatedRecipe.dimensions.width,
        updatedRecipe.dimensions.height,
        updatedRecipe.dimensions.unit,
        updatedRecipe.yield_percentage,
        updatedRecipe.waste_factor,
        updatedRecipe.unit_of_measure,
        updatedRecipe.inventory_location,
        now,
        id
    ).run();

    if (updateData.parts !== undefined) {
        await env.DB.prepare('DELETE FROM recipe_parts WHERE recipe_id = ?').bind(id).run();
        for (const part of updatedRecipe.parts) {
            await env.DB.prepare(`
                INSERT INTO recipe_parts (recipe_id, name, quantity, cost_per_unit)
                VALUES (?, ?, ?, ?)
            `).bind(id, part.name, part.quantity, part.cost_per_unit).run();
        }
    }

    if (updateData.labor !== undefined) {
        await env.DB.prepare('DELETE FROM recipe_labor WHERE recipe_id = ?').bind(id).run();
        for (const labor of updatedRecipe.labor) {
            await env.DB.prepare(`
                INSERT INTO recipe_labor (recipe_id, type, cost_per_hour, hours_needed)
                VALUES (?, ?, ?, ?)
            `).bind(id, labor.type, labor.cost_per_hour, labor.hours_needed).run();
        }
    }

    return await getRecipeById(id, env);
}

async function deleteRecipe(id: string, env: any): Promise<boolean> {
    const result = await env.DB.prepare('DELETE FROM recipes WHERE id = ?').bind(id).run();
    return (result.changes || 0) > 0;
}

export default {
    async fetch(request: Request, env: any): Promise<Response> {
        const corsResponse = await handleCORS(request);
        if (corsResponse) {
            return corsResponse;
        }

        const { pathname } = new URL(request.url);
        
        // Apply rate limiting to API endpoints
        if (pathname.startsWith('/api/')) {
            const { success } = await env.API_RATE_LIMITER.limit({ key: pathname });
            if (!success) {
                return new Response(`429 Failure – rate limit exceeded for ${pathname}`, { 
                    status: 429,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                    }
                });
            }
        }

        const method = request.method;

        try {
            if (method === 'GET' && pathname === '/') {
                // Return a simple HTML response for now - ASSETS binding needs different setup
                return new Response(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Recipe Cost Calculator</title>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    </head>
                    <body>
                        <h1>Recipe Cost Calculator API</h1>
                        <p>API is running. Use the endpoints below:</p>
                        <ul>
                            <li>GET /api/recipes - Get all recipes</li>
                            <li>POST /api/recipes - Create recipe</li>
                            <li>GET /api/recipes/:id - Get recipe</li>
                            <li>PUT /api/recipes/:id - Update recipe</li>
                            <li>DELETE /api/recipes/:id - Delete recipe</li>
                        </ul>
                    </body>
                    </html>
                `, {
                    headers: {
                        'Content-Type': 'text/html',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }

            if (method === 'GET' && pathname === '/api/recipes/cost/summary') {
                const recipes = await getAllRecipes(env);
                const summary = recipes.map(recipe => {
                    const cost = calculateRecipeCost(recipe);
                    return {
                        recipe_id: recipe.id,
                        recipe_name: recipe.name,
                        total_cost: cost.cost_summary.total,
                        parts_cost: recipe.parts.reduce((sum, part) => sum + (part.quantity * part.cost_per_unit), 0),
                        labor_cost: recipe.labor.reduce((sum, labor) => sum + (labor.hours_needed * labor.cost_per_hour), 0),
                        unit_of_measure: cost.cost_summary.unit_of_measure
                    };
                });
                
                const grandTotal = summary.reduce((total, item) => total + item.total_cost, 0);
                
                return sendJSON({
                    recipes: summary,
                    totals: {
                        total_parts_cost: summary.reduce((sum, item) => sum + item.parts_cost, 0),
                        total_labor_cost: summary.reduce((sum, item) => sum + item.labor_cost, 0),
                        grand_total: grandTotal,
                        average_cost_per_recipe: summary.length > 0 ? grandTotal / summary.length : 0,
                        total_recipes: summary.length,
                        currency: 'USD'
                    }
                });
            }

            if (method === 'GET' && pathname.startsWith('/api/recipes/') && pathname.endsWith('/cost')) {
                const pathParts = pathname.split('/');
                const id = pathParts[3];
                const recipe = await getRecipeById(id, env);
                
                if (!recipe) {
                    return sendJSON({ error: 'Recipe not found' }, 404);
                }

                const costBreakdown = calculateRecipeCost(recipe);
                return sendJSON(costBreakdown);
            }

            if (method === 'GET' && pathname === '/api/recipes') {
                const recipes = await getAllRecipes(env);
                return sendJSON(recipes);
            }

            if (method === 'GET' && pathname.startsWith('/api/recipes/')) {
                const pathParts = pathname.split('/');
                if (pathParts.length === 4) {
                    const id = pathParts[3];
                    const recipe = await getRecipeById(id, env);
                    
                    if (!recipe) {
                        return sendJSON({ error: 'Recipe not found' }, 404);
                    }
                    
                    return sendJSON(recipe);
                }
            }

            if (method === 'POST' && pathname === '/api/recipes') {
                const body = await request.json();
                const validation = validateRecipe(body);
                if (!validation.valid) {
                    return sendJSON({ error: validation.message }, 400);
                }

                const newRecipe = await createRecipe(body, env);
                return sendJSON(newRecipe, 201);
            }

            if (method === 'PUT' && pathname.startsWith('/api/recipes/')) {
                const pathParts = pathname.split('/');
                if (pathParts.length >= 4) {
                    const id = pathParts[3];
                    const body = await request.json();
                    const validation = validatePartialRecipe(body);
                    if (!validation.valid) {
                        return sendJSON({ error: validation.message }, 400);
                    }

                    const updatedRecipe = await updateRecipe(id, body, env);
                    if (!updatedRecipe) {
                        return sendJSON({ error: 'Recipe not found' }, 404);
                    }
                    
                    return sendJSON(updatedRecipe);
                }
            }

            if (method === 'DELETE' && pathname.startsWith('/api/recipes/')) {
                const pathParts = pathname.split('/');
                if (pathParts.length >= 4) {
                    const id = pathParts[3];
                    const deleted = await deleteRecipe(id, env);
                    
                    if (!deleted) {
                        return sendJSON({ error: 'Recipe not found' }, 404);
                    }

                    return new Response(null, { status: 204 });
                }
            }

            return sendJSON({ error: 'Route not found' }, 404);

        } catch (error) {
            console.error('Error handling request:', error);
            return sendJSON({ error: 'Something went wrong!' }, 500);
        }
    }
}
