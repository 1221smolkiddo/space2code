import {afterEach,describe,expect,it,vi} from 'vitest'
import {buildApp} from '../src/app.js'
import {RoomService,type RoomEvent} from '../src/rooms/service.js'
import {InMemoryRoomRepository} from '../src/rooms/in-memory-room-repository.js'
import {ExecutionService} from '../src/execution/service.js'
import {PistonExecutionProvider} from '../src/execution/piston-provider.js'
import {InMemoryExecutionGuard} from '../src/execution/guard.js'
import {initialLanguageRegistry} from '../src/execution/language-registry.js'

afterEach(()=>vi.unstubAllGlobals())
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002'
const programs=[
  {language:'python',providerLanguage:'python',source:'name = input()\nprint(name)'},
  {language:'c',providerLanguage:'c',source:'#include <stdio.h>\nint main(){int n;scanf("%d",&n);printf("%d",n);}'},
  {language:'cpp',providerLanguage:'c++',source:'#include <iostream>\nint main(){int n;std::cin>>n;std::cout<<n;}'},
  {language:'java',providerLanguage:'java',source:'import java.util.Scanner;class Main{public static void main(String[] a){System.out.print(new Scanner(System.in).nextLine());}}'},
  {language:'javascript',providerLanguage:'javascript',source:'process.stdin.on("data", data=>process.stdout.write(data))'},
]
describe('HTTP execution to Piston stdin contract',()=>{
  for(const program of programs){
    for(const stdin of ['', '22', 'Alice\n22', 'Alice\n22\n']){
      it(`preserves ${JSON.stringify(stdin)} for ${program.language} and broadcasts the selected desk result`,async()=>{
        const repository=new InMemoryRoomRepository(),rooms=new RoomService(repository)
        const room=await rooms.create(A,program.language);await rooms.join(B,room.roomCode)
        const events:RoomEvent[]=[]
        const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({language:program.providerLanguage,version:'test',run:{stdout:'test output',stderr:'',code:0,signal:null}})))
        vi.stubGlobal('fetch',fetchMock)
        const service=new ExecutionService(repository,new PistonExecutionProvider({executeUrl:'http://piston.test/execute'}),initialLanguageRegistry({python:'*',java:'*',c:'*',cpp:'*',javascript:'*'}),new InMemoryExecutionGuard({windowMs:60000,userLimit:10,roomLimit:20}),{maxSourceBytes:10000,maxStdinBytes:10000,maxOutputBytes:10000,timeoutMs:1000},undefined,{publish:async(_room,event)=>{events.push(event)}})
        const app=await buildApp({roomService:rooms,executionService:service,authService:{verifyAccessToken:async()=>({id:A,email:null})},corsOrigin:'http://localhost:5173',logger:false})
        try{
          const response=await app.inject({method:'POST',url:`/v1/rooms/${room.id}/execute`,headers:{authorization:'Bearer test'},payload:{language:program.language,source:program.source,stdin,targetSlot:'B'}})
          expect(response.statusCode).toBe(200)
          const sent=JSON.parse(fetchMock.mock.calls[0]![1].body)
          expect(sent).toMatchObject({language:program.providerLanguage,stdin,files:[{content:program.source}]})
          expect(events.filter(event=>event.type==='execution.started')).toHaveLength(1)
          expect(events.filter(event=>event.type==='execution.completed')).toHaveLength(1)
          expect(events[0]).toMatchObject({type:'execution.started',userId:A,targetSlot:'B',scope:'personal'})
          expect(events[1]).toMatchObject({type:'execution.completed',userId:A,targetSlot:'B',scope:'personal',result:response.json()})
        }finally{await app.close()}
      })
    }
  }
})
