import { NextPageContext } from 'next'

function Error({ statusCode }: { statusCode?: number }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <p>{statusCode ? `서버 오류 (${statusCode})` : '클라이언트 오류가 발생했습니다'}</p>
    </div>
  )
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error
