import { getTermPublication } from "@/lib/term-archive";
import { parseRoutineSelection, projectRoutine } from "@/lib/routine-projection";
import { serializeRoutineCsv } from "@/lib/routine-csv";
import { AuthenticationError, AuthorizationError } from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string;versionId:string}>}) {
  try {
    const {id,versionId}=await params;const archive=await getTermPublication(Number(id),Number(versionId));
    if(!archive)return Response.json({error:"Stored publication unavailable."},{status:404,headers:{"Cache-Control":"no-store"}});
    const parsed=parseRoutineSelection(Object.fromEntries(new URL(request.url).searchParams),archive.source,{strict:true});
    if(parsed.errors.length)return Response.json({errors:parsed.errors},{status:400,headers:{"Cache-Control":"no-store"}});
    const csv=serializeRoutineCsv(projectRoutine({source:archive.source,selection:parsed.selection}));
    return new Response(csv.body,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${csv.filename}"`,"Cache-Control":"no-store"}});
  } catch(error){if(error instanceof AuthenticationError||error instanceof AuthorizationError)return Response.json({error:"Sign in with internal viewing permission."},{status:error instanceof AuthenticationError?401:403,headers:{"Cache-Control":"no-store"}});throw error;}
}
